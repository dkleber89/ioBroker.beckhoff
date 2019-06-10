
'use strict';

const xml2js = require('xml2js'),
    fs = require('fs'),
    ads = require('node-ads-api');


/**
 * @param   {object}  adapter   ioBroker Adapter Object to be able to use some Properties and some Methods from the Adapter
 * @returns {void}
 */
module.exports = (adapter) => {
    if (adapter.config.xmlTpyData === '') {
        adapter.log.error('No *.tpy File was Uploaded. Please upload a *.tpy File or use an other Mode in Config Window.');

        return;
    }

    xml2js.parseString(
        adapter.config.xmlTpyData,
        {
            'parseBooleans': true,
            'parseNumbers': true,
            'normalize': true
        },
        (error, result) => {
            if (error) {
                adapter.log.error('No proper *.tpy File was Uploaded. Please upload a proper *.tpy File or use an other Mode in Config Window.');

                return;
            }

            const symbols = result.PlcProjectInfo.Symbols[0].Symbol,
                dataTypes = result.PlcProjectInfo.DataTypes[0].DataType;

            const filteredSymbols = [];

            for (let i = 0; i < symbols.length; i++) {
                let symName = '';

                if (symbols[i].Name[0]._) {
                    symName = symbols[i].Name[0]._;
                } else {
                    symName = symbols[i].Name[0];
                }

                if (
                    symName.toLowerCase().indexOf(adapter.config.targetVTable.toLowerCase()) === 1 &&
                    adapter.config.targetAmsPort === '901'    // TC2
                ) {
                    filteredSymbols.push(symbols[i]);
                }
            }

            if (filteredSymbols.length <= 0) {
                adapter.log.info(`No Variables in Table (${adapter.config.targetVTable}) are found in PLC. Please check your Tablename`);

                return;
            }

            try {
                adapter.config.symbolObjectList = createSymbolObjectList(dataTypes, filteredSymbols);
            } catch (e) {
                adapter.log.warn(`Sync PLC Variables: ${e} Please Check your Variable Table and your Datatypes in PLC`);
            }
        }
    );
};



/**
 * @param   {object}  adapter   ioBroker Adapter Object to be able to use some Properties and some Methods from the Adapter
 * @returns {void}
 */
function xmlParser (adapter) {
    fs.readFile('../test/projectData.tpy', {'encoding': 'utf-8'}, (err, data) => {
        if (err) {
            console.error(err);

            return;
        }

        xml2js.parseString(
            data,
            {
                'parseBooleans': true,
                'parseNumbers': true,
                'normalize': true
            },
            (error, result) => {
                if (error) {
                    console.error(error);

                    return;
                }

                fs.writeFile('../test/jsonProjectData.json', JSON.stringify(result, null, 2), (errorWrite) => {
                    if (errorWrite) {
                        console.error(errorWrite);
                    }
                });

                const symbols = result.PlcProjectInfo.Symbols[0].Symbol,
                    dataTypes = result.PlcProjectInfo.DataTypes[0].DataType;

                const filteredSymbols = [];

                for (let i = 0; i < symbols.length; i++) {
                    let symName = '';

                    if (symbols[i].Name[0]._) {
                        symName = symbols[i].Name[0]._;
                    } else {
                        symName = symbols[i].Name[0];
                    }

                    if (
                        symName.toLowerCase().indexOf(adapter.config.targetVTable.toLowerCase()) === 1 &&
                        adapter.config.targetAmsPort === '901'    // TC2
                    ) {
                        filteredSymbols.push(symbols[i]);
                    }
                }

                if (filteredSymbols.length <= 0) {
                    adapter.log.info(`No Variables in Table (${adapter.config.targetVTable}) are found in PLC. Please check your Tablename`);

                    return;
                }

                try {
                    adapter.config.symbolObjectList = createSymbolObjectList(dataTypes, filteredSymbols);
                } catch (e) {
                    adapter.log.warn(`Sync PLC Variables: ${e} Please Check your Variable Table and your Datatypes in PLC`);
                }
            }
        );
    });
}


/**
 * Create a Array that contains a objects with a exact construction to use it with the node-ads-api Package
 *
 * @param   {array}     datatyps            List of all known Datatypes in PLC with Subdatatypelists
 * @param   {array}     symbols             SymbolList of all Symbols in PLC they are reachable over ADS
 * @param   {number}    [datatypeIndex]     Index of Datatype to find it in recusion fast and without seek
 * @param   {string}    [prefix]            Symbolprefix to walk trought the Symboltree of Symbollist of PLC
 * @returns {array}                         SymbolList for creating States in ioBroker and subscibe the Handles
 */
function createSymbolObjectList (datatyps, symbols, datatypeIndex, prefix) {
    const knownDatatypes = ['BOOL', 'BYTE', 'WORD', 'DWORD', 'SINT', 'USINT', 'INT', 'UINT', 'DINT', 'UDINT', 'REAL', 'TIME'],
        tempObject = {
            'symname': '',
            'bytelength': null,
            'lastWriteTime': 0
        };

    let symbolObjectList = [];

    if (!prefix || !datatypeIndex) {
        for (let i = 0; i < symbols.length; i++) {
            if (symbols[i].Name[0]._) {
                tempObject.symname = symbols[i].Name[0]._;
            } else {
                tempObject.symname = symbols[i].Name[0];
            }

            // Is the Datatype a known basic Datatype then Create an Push Datapointobject to OutputArray
            if (knownDatatypes.includes(symbols[i].Type[0])) {
                if (symbols[i].Name[0]._) {
                    tempObject.symname = symbols[i].Name[0]._;
                } else {
                    tempObject.symname = symbols[i].Name[0];
                }

                tempObject.bytelength = ads[symbols[i].Type[0]];

                symbolObjectList.push(JSON.parse(JSON.stringify(tempObject)));
                continue;
            }

            // No basic Datatype, then we need to seek in Userdatatypes
            let found = false;

            for (let j = 0; j < datatyps.length; j++) {
                // When a Userdataype is available proceed with the next Level in the Tree

                if (datatyps[j].Name[0]._ === symbols[i].Type[0]._) {
                    symbolObjectList = symbolObjectList.concat(createSymbolObjectList(datatyps, symbols, j, `${tempObject.symname}.`));

                    found = true;

                    break;
                }
            }

            // Userdatatype not found (normaly Impossible) or Basedatatype not supported then throw an Error
            if (!found) {
                let symType = '';

                if (symbols[i].Type[0]._) {
                    symType = symbols[i].Type[0]._;
                } else {
                    symType = symbols[i].Type[0];
                }

                throw new Error(`Type (${symType}) not Found or not Supported!!`);
            }
        }

        // TODO: Raus!!
        console.log(JSON.stringify(symbolObjectList, null, 2));

        return symbolObjectList;
    }


    // Here we are in Level 2 or deeper in the Symbol Tree

    // Found a Datatyp thats not a Struct
    if (!Object.prototype.hasOwnProperty.call(datatyps[datatypeIndex], 'SubItem')) {
        throw new Error(`Type (${datatyps[datatypeIndex].Name[0]._}) found but not Supported!!`);
    }

    const datatyp = datatyps[datatypeIndex].SubItem;

    for (let i = 0; i < datatyp.length; i++) {
        // When we found here some basic Datatypes -> Adding to Datapointarray with complete Path
        if (knownDatatypes.includes(datatyp[i].Type[0])) {
            tempObject.symname = `${prefix}${datatyp[i].Name[0]}`;
            tempObject.bytelength = ads[datatyp[i].Type[0]];

            symbolObjectList.push(JSON.parse(JSON.stringify(tempObject)));
            continue;
        }

        // No basic Datatype so we have dive a Level deeper in the Tree...
        let found = false;

        for (let j = 0; j < datatyps.length; j++) {
            if (datatyps[j].Name[0]._ === datatyp[i].Name[0]) {
                symbolObjectList = symbolObjectList.concat(createSymbolObjectList(datatyps, symbols, j, `${prefix}${datatyp[i].Name[0]}.`));

                found = true;

                break;
            }
        }

        // Userdatatype not found (normaly Impossible) or Basedatatype not supported then throw an Error
        if (!found) {
            throw new Error(`Type (${JSON.stringify(datatyp[i].Type[0])}) not Found or not Supported!!`);
        }
    }

    return symbolObjectList;
}


// TODO: Tests müssen noch Raus:
let adapter = {
    config: {
        targetVTable: 'sParametersMemory',
        targetAmsPort: '901',
        symbolObjectList: []
    },
    log: {
        info: console.log,
        warn: console.log
    }
};

xmlParser(adapter);
