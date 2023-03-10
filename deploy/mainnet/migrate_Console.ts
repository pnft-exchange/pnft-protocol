import fs from "fs";

import bn from "bignumber.js"

import hre, { ethers } from "hardhat";

import { encodePriceSqrt, formatSqrtPriceX96ToPrice } from "../../test/shared/utilities";
import { AccountBalance, BaseToken, ClearingHouse, ClearingHouseConfig, VPool, GenericLogic, InsuranceFund, MarketRegistry, MockPNFTToken, NftPriceFeed, QuoteToken, RewardMiner, TestERC20, TestFaucet, UniswapV3Pool, Vault, PNFTToken } from "../../typechain";
import { getMaxTickRange, priceToTick } from "../../test/helper/number";
import helpers from "../helpers";
import { formatEther, parseEther } from "ethers/lib/utils";
const { waitForTx, tryWaitForTx, loadDB } = helpers;

import migrateAdmin from "./1_migrate_Admin";
import migratePriceFeedAll from "./2_migrate_PriceFeed_All";
import migrateQuoteToken from "./4_migrate_QuoteToken";
import migrateBaseTokenAll from "./5_migrate_BaseToken_All";
import migrateLibrary from "./6_migrate_Library";
import migrateClearingHouseConfig from "./7_migrate_ClearingHouseConfig";
import migrateMarketRegistry from "./8_migrate_MarketRegistry";
import migrateAccountBalance from "./9_migrate_AccountBalance";
import migrateVPool from "./10_migrate_VPool";
import migrateInsuranceFund from "./11_migrate_InsuranceFund";
import migrateVault from "./12_migrate_Vault";
import migrateClearingHouse from "./13_migrate_ClearingHouse";
import migratePNFTToken from "./14_migrate_PNFTToken";
import migrateRewardMiner from "./15_migrate_RewardMiner";
import { } from "../../test/helper/clearingHouseHelper";
import { providers } from "ethers";


async function main() {
    await deploy();
}

export default deploy;

async function deploy() {

    const network = hre.network.name;
    let deployData = (await loadDB(network))
    let priceData: PriceData;
    {
        let dataText = await fs.readFileSync(process.cwd() + '/deploy/mainnet/address/prices.json')
        priceData = JSON.parse(dataText.toString())
    }

    const [admin, maker, priceAdmin] = await ethers.getSigners()

    // deploy UniV3 factory
    var genericLogic = (await hre.ethers.getContractAt('GenericLogic', deployData.genericLogic.address)) as GenericLogic;
    var clearingHouseConfig = (await hre.ethers.getContractAt('ClearingHouseConfig', deployData.clearingHouseConfig.address)) as ClearingHouseConfig;
    var marketRegistry = (await hre.ethers.getContractAt('MarketRegistry', deployData.marketRegistry.address)) as MarketRegistry;
    var accountBalance = (await hre.ethers.getContractAt('AccountBalance', deployData.accountBalance.address)) as AccountBalance;
    var vPool = (await hre.ethers.getContractAt('VPool', deployData.vPool.address) as VPool);
    var insuranceFund = (await hre.ethers.getContractAt('InsuranceFund', deployData.insuranceFund.address)) as InsuranceFund;
    var vault = (await hre.ethers.getContractAt('Vault', deployData.vault.address)) as Vault;
    var clearingHouse = (await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.address)) as ClearingHouse;
    var rewardMiner = (await hre.ethers.getContractAt('RewardMiner', deployData.rewardMiner.address)) as RewardMiner;
    var pNFTToken = (await hre.ethers.getContractAt('PNFTToken', deployData.pNFTToken.address)) as PNFTToken;
    var testFaucet = (await hre.ethers.getContractAt('TestFaucet', deployData.testFaucet.address)) as TestFaucet;
    var wETH = (await hre.ethers.getContractAt('TestERC20', deployData.wETH.address)) as TestERC20;

    console.log('START')


    // await clearingHouse.connect(trader1).openPosition({
    //     baseToken: deployData.vDOODLE.address,
    //     isBaseToQuote: false,
    //     isExactInput: true,
    //     oppositeAmountBound: 0,
    //     amount: parseEther('200'),
    //     sqrtPriceLimitX96: encodePriceSqrt('4.4', '1'),
    //     deadline: ethers.constants.MaxUint256,
    //     referralCode: ethers.constants.HashZero,
    // }),

    // let openPositionData = clearingHouse.interface.encodeFunctionData(
    //     'openPosition',
    //     [
    //         {
    //             baseToken: deployData.vBAYC.address,
    //             isBaseToQuote: true,
    //             isExactInput: false,
    //             oppositeAmountBound: 0,
    //             amount: parseEther('0.1'),
    //             sqrtPriceLimitX96: 0,
    //             deadline: ethers.constants.MaxUint256,
    //             referralCode: ethers.constants.HashZero,
    //         }
    //     ],
    // )
    // let gasUsed = await ethers.provider.estimateGas({
    //     from: '0x83D543985cC66bb5b8B2C1B0Db8284456187eA44',
    //     to: deployData.clearingHouse.address,
    //     data: openPositionData,
    //     value: 0
    // });
    // let gasPrice = await ethers.provider.getGasPrice()
    // console.log("Esimated Gas: " + formatEther(gasPrice.mul(gasUsed)));

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});