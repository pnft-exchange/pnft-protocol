import fs from "fs";

import hre, { ethers } from "hardhat";
import helpers from "../helpers";

import { ProxyAdmin } from "../../typechain/openzeppelin/ProxyAdmin";

const { waitForDeploy, verifyContract, loadDB, saveDB, upgradeContract } = helpers;

async function main() {
    await deploy();
}

export default deploy;

async function deploy() {
    const network = hre.network.name;
    let deployData = (await loadDB(network))
    // 
    const [admin, maker, priceAdmin] = await ethers.getSigners()
    // 
    {
        deployData.makerFundAddress = maker.address
        deployData = (await saveDB(network, deployData))
    }
    // 
    const TransparentUpgradeableProxy = await hre.ethers.getContractFactory('TransparentUpgradeableProxy');
    // 
    var proxyAdmin = await hre.ethers.getContractAt('ProxyAdmin', deployData.proxyAdminAddress);
    //
    if (deployData.clearingHouse.implAddress == undefined || deployData.clearingHouse.implAddress == '') {
        let ClearingHouse = await hre.ethers.getContractFactory("ClearingHouse", {
            libraries: {
                UniswapV3Broker: deployData.uniswapV3Broker.address,
                GenericLogic: deployData.genericLogic.address,
                ClearingHouseLogic: deployData.clearingHouseLogic.address,
            },
        });
        const clearingHouse = await waitForDeploy(await ClearingHouse.deploy())
        {
            deployData.clearingHouse.implAddress = clearingHouse.address;
            deployData = (await saveDB(network, deployData))
            console.log('clearingHouse is deployed', clearingHouse.address)
        }
    }
    if (deployData.clearingHouse.address == undefined || deployData.clearingHouse.address == '') {
        var clearingHouse = await hre.ethers.getContractAt('ClearingHouse', deployData.clearingHouse.implAddress);
        var initializeData = clearingHouse.interface.encodeFunctionData('initialize', [
            deployData.clearingHouseConfig.address,
            deployData.vault.address,
            deployData.vETH.address,
            deployData.uniswapV3Factory.address,
            deployData.vPool.address,
            deployData.accountBalance.address,
            deployData.marketRegistry.address,
            deployData.insuranceFund.address,
            deployData.platformFundAddress,
            maker.address,
        ]);
        var transparentUpgradeableProxy = await waitForDeploy(
            await TransparentUpgradeableProxy.deploy(
                deployData.clearingHouse.implAddress,
                proxyAdmin.address,
                initializeData,
            )
        );
        {
            deployData.clearingHouse.address = transparentUpgradeableProxy.address;
            deployData = (await saveDB(network, deployData))
            console.log('clearingHouse TransparentUpgradeableProxy is deployed', transparentUpgradeableProxy.address)
        }
    }
    {
        await upgradeContract(proxyAdmin as ProxyAdmin, deployData.clearingHouse.address, deployData.clearingHouse.implAddress)
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
// main().catch((error) => {
//     console.error(error);
//     process.exitCode = 1;
// });