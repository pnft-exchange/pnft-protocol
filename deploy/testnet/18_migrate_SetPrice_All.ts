import fs from "fs";

import hre, { ethers } from "hardhat";

import { encodePriceSqrt } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, MarketRegistry, NftPriceFeed, OrderBook, QuoteToken, UniswapV3Pool } from "../../typechain";
import { getMaxTickRange } from "../../test/helper/number";
import helpers from "../helpers";
import { parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx } = helpers;


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    const [admin, maker, priceAdmin, platformFund, trader, liquidator] = await ethers.getSigners()

    var price = '1'

    let nftPriceFeeds = [
        deployData.nftPriceFeedBAYC,
        deployData.nftPriceFeedMAYC,
        deployData.nftPriceFeedCRYPTOPUNKS,
        deployData.nftPriceFeedMOONBIRD,
        deployData.nftPriceFeedAZUKI,
        deployData.nftPriceFeedCLONEX,
        deployData.nftPriceFeedDOODLE,
    ];
    for (let i = 0; i < nftPriceFeeds.length; i++) {
        var nftPriceFeedAddress = nftPriceFeeds[i].address
        var priceFeed = (await hre.ethers.getContractAt('NftPriceFeed', nftPriceFeedAddress)) as NftPriceFeed;
        await waitForTx(
            await priceFeed.connect(priceAdmin).setPrice(parseEther(price))
        )
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });