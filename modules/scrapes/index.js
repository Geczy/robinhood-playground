const puppeteer = require('puppeteer');
const regCronIncAfterSixThirty = require('../../utils/reg-cron-after-630');
const filterByTradeable = require('../../utils/filter-by-tradeable');

const registerPicks = require('../../app-actions/record-picks');
const purchaseStocks = require('../../app-actions/purchase-stocks');


const FIZBIZ = require('./fizbiz');
const STOCKINVEST = require('./stockinvest');

const scrapesToRun = {
    fizbiz: FIZBIZ,
    stockinvest: STOCKINVEST
};



// based on jump
const scrapes = {
    init: (Robinhood) => {
        // runs at init
        Object.keys(scrapesToRun).forEach(scrapeName => {
            const { config, scrapeFn } = scrapesToRun[scrapeName];
            regCronIncAfterSixThirty(Robinhood, {
                name: `record ${scrapeName}-scrapes`,
                // run: [15], // 7:00am
                run: config.RUN,
                fn: async (Robinhood, min) => {

                    console.log(`running ${scrapeName}-scrapes`);
                    const browser = await puppeteer.launch({headless: true });
                    const queries = Object.keys(config.QUERIES);
                    for (let queryName of queries) {
                        console.log(queryName);
                        const queryPicks = await scrapeFn(browser, config.QUERIES[queryName]);
                        const tradeablePicks = filterByTradeable(queryPicks).slice(0, 15);
                        const strategyName = `${scrapeName}-${queryName}`;
                        // console.log(queryName, queryPicks);
                        await registerPicks(Robinhood, strategyName, min, tradeablePicks);
                    }
                    await browser.close();
                }
            });

        });


    }
};

module.exports = scrapes;
