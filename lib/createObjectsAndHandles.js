/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 dkleber89 <dkleber89@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */

'use strict';

const ads = require('node-ads-api');

/**
 * Every Symbol in Variabletable need to have a State in ioBroker. First delete all old and unnecessary and create all needed States.
 * After that register plc Handles to be notified when some Value on PLC get Changed
 *
 * @param   {object}    adsC        adsClient Socket to PLC
 * @param   {object}    adapter     ioBroker Adapter Object. To have access to some Properties and Methods of the Adapter Object.
 * @returns {void}
 */
module.exports = (adsC, adapter) => {
    adapter.getStatesOf(adapter.namespace, 'plc', (err, res) => {
        if (err) {
            adapter.log.warn(`Seeking States in 'PLC' occurred an Error: ${err}`);

            return;
        }

        // Seeking in States if there is some State that not anymore needed and then delete
        for (let i = 0; i < res.length; i++) {
            let found = false;

            const shortId = res[i]._id.replace(`${adapter.namespace}.`, '');    // eslint-disable-line no-underscore-dangle

            for (let j = 0; j < adapter.config.symbolObjectList.length; j++) {
                if (`plc.${adapter.config.symbolObjectList[j].symname}` === shortId) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                adapter.delObject(shortId);
            }
        }
    });

    adsC.releaseNotificationHandles(() => {
        // Create Notification Handle for Symboltable
        const symTableHandle = {
            'indexGroup': ads.ADSIGRP.SYM_VERSION,
            'indexOffset': 0,
            'bytelength': ads.BYTE
        };

        adsC.notify(symTableHandle);

        // Create for every Item in SymbolObject list a State in PLC Channel when its not already available
        for (let i = 0; i < adapter.config.symbolObjectList.length; i++) {
            const item = adapter.config.symbolObjectList[i];

            let symbolName = item.symname.substr(item.symname.lastIndexOf('.') + 1, item.symname.length);

            // For resync Symbol -> No State needed
            if (symbolName.toLowerCase() === 'iobrokerresync') {
                adsC.notify(item);

                continue;
            }

            symbolName = `${symbolName} [${item.bytelength.name}]`;

            let type = 'number';
            let def = 0;
            let role = 'level';

            if (item.bytelength.name === 'BOOL') {
                type = 'boolean';
                def = false;
                role = 'switch';
            }

            adapter.setObjectNotExists(
                `plc.${item.symname}`,
                {
                    'type': 'state',
                    'common': {
                        'name': symbolName,
                        'type': type,
                        'role': role,
                        'read': true,
                        'write': true,
                        'def': def
                    },
                    'native': {'bytelength': item.bytelength}
                },

                // When State is created then register handler for value changing on PLC
                () => {
                    adsC.notify(item);
                }
            );
        }
    });
};