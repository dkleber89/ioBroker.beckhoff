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
  let waitForDeleteStates = 1;

  adapter.getStatesOf(adapter.namespace, 'plc', (err, res) => {
    if (err) {
      adapter.log.warn(`Seeking States in 'PLC' occurred an Error: ${err}`);

      waitForDeleteStates = 0;

      return;
    }

    adapter.log.debug('PLC States received');

    // Seeking in States if there is some State that not anymore needed and then delete
    for (let i = 0; i < res.length; i += 1) {
      let found = false;

      const shortId = res[i]._id.replace(`${adapter.namespace}.`, ''); // eslint-disable-line no-underscore-dangle
      const dataTypeId = res[i].native.bytelength.name;

      for (let j = 0; j < adapter.config.symbolObjectList.length; j += 1) {
        let symname = '';

        // TC2 needs the Point on TC3 don´t need it
        if (adapter.config.targetAmsPort.indexOf('01') >= 1) {
          symname = `plc${adapter.config.symbolObjectList[j].symname}`;
        } else {
          symname = `plc.${adapter.config.symbolObjectList[j].symname}`;
        }

        if (symname === shortId && adapter.config.symbolObjectList[j].bytelength.name === dataTypeId) {
          found = true;
          break;
        }
      }

      if (!found) {
        waitForDeleteStates += 1;

        // eslint-disable-next-line no-loop-func
        adapter.delObject(shortId, error => {
          waitForDeleteStates -= 1;

          if (error) {
            adapter.log.debug(`Can not delete unnessecary Object or with wrong Datatyp (${shortId}). Error: ${error}`);
          } else {
            adapter.log.debug(`Unnessecary Object or with wrong Datatyp deleted (${shortId}).`);
          }
        });
      }
    }

    waitForDeleteStates -= 1;
  });

  (function waitingForDeleteStates(first) {
    if (waitForDeleteStates) {
      setTimeout(waitingForDeleteStates, 500);

      if (!first) {
        adapter.log.debug(`Wait for deleting old States. ${waitForDeleteStates} remaining.`);
      }
    } else {
      adapter.log.debug('Release all Notification Handles first.');

      adsC.releaseNotificationHandles(error => {
        if (error) {
          adapter.log.warn(`Release Notification Handles failed: ${error}`);
        } else {
          adapter.log.debug('All Notification Handles are released.');
        }

        if (adapter.config.targetAmsPort !== '901') {
          // Create Notification Handle for Symboltable
          const symTableHandle = {
            indexGroup: ads.ADSIGRP.SYM_VERSION,
            indexOffset: 0,
            bytelength: ads.BYTE,
          };

          adsC.notify(symTableHandle, err => {
            if (err) {
              adapter.log.debug(`Subscription on Symboltablechange occure an Error: ${err}`);
            } else {
              adapter.log.debug('Subscription on Symboltablechange done.');
            }
          });
        }

        // Create for every Item in SymbolObject list a State in PLC Channel when its not already available
        let i = 0;

        (function createStatesAndSubscribe() {
          if (i >= adapter.config.symbolObjectList.length) {
            return;
          }

          const item = adapter.config.symbolObjectList[i];

          let symbolName = item.symname.substr(item.symname.lastIndexOf('.') + 1, item.symname.length);

          // For resync Symbol -> No State needed
          if (symbolName.toLowerCase() === 'iobrokerresync') {
            adapter.log.debug(`Send Subscription for: ${item.symname} to PLC`);

            adsC.notify(item, err => {
              if (err) {
                adapter.log.warn(`Subscription for: ${item.symname} occure an Error: ${err}`);
              } else {
                adapter.log.debug(`Subscription for: ${item.symname} done.`);
              }

              // Next State !!
              i += 1;
              createStatesAndSubscribe();
            });

            return;
          }

          if (item.bytelength.name === 'STRING') {
            symbolName = `${symbolName} [STRING(80)]`;
          } else {
            symbolName = `${symbolName} [${item.bytelength.name}]`;
          }

          let type = 'number';
          let def = 0;
          let role = 'level';

          if (item.bytelength.name === 'BOOL') {
            type = 'boolean';
            def = false;
            role = 'switch';
          }

          if (item.bytelength.name === 'STRING') {
            type = 'string';
            def = '';
            role = 'text';
          }

          let statename = '';

          // TC2 needs the Point on TC3 don´t need it
          if (adapter.config.targetAmsPort.indexOf('01') >= 1) {
            statename = `plc${item.symname}`;
          } else {
            statename = `plc.${item.symname}`;
          }

          const channelname = statename.slice(0, statename.lastIndexOf('.'));

          adapter.setObjectNotExists(
            channelname,
            {
              type: 'channel',
            },
            () => {
              adapter.setObjectNotExists(
                statename,
                {
                  type: 'state',
                  common: {
                    type,
                    role,
                    def,
                    name: symbolName,
                    read: true,
                    write: true,
                  },
                  native: { bytelength: item.bytelength },
                },
                () => {
                  // When State is created then register handler for value changing on PLC
                  adapter.log.debug(`Send Subscription for: ${item.symname} to PLC`);

                  adsC.notify(item, err => {
                    if (err) {
                      adapter.log.warn(`Subscription for: ${item.symname} occure an Error: ${err}`);
                    } else {
                      adapter.log.debug(`Subscription for: ${item.symname} done.`);
                    }

                    // Next State !!
                    i += 1;
                    createStatesAndSubscribe();
                  });
                }
              );
            }
          );
        })();
      });
    }
  })(true);
};
