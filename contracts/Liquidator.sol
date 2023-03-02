// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;
import { TransferHelper } from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import { ILiquidator } from "./interface/ILiquidator.sol";
import { IClearingHouse } from "./interface/IClearingHouse.sol";
import { IClearingHouseConfig } from "./interface/IClearingHouseConfig.sol";
import { IAccountBalance } from "./interface/IAccountBalance.sol";
import { IVault } from "./interface/IVault.sol";
import { IVault } from "./interface/IVault.sol";
import { BlockContext } from "./base/BlockContext.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnerPausable } from "./base/OwnerPausable.sol";
import { LiquidatorStorage } from "./storage/LiquidatorStorage.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { PerpSafeCast } from "./lib/PerpSafeCast.sol";
import { DataTypes } from "./types/DataTypes.sol";
import "hardhat/console.sol";

contract Liquidator is ILiquidator, BlockContext, ReentrancyGuardUpgradeable, OwnerPausable, LiquidatorStorage {
    using AddressUpgradeable for address;
    using SignedSafeMathUpgradeable for int256;
    using SafeMathUpgradeable for uint256;
    using PerpMath for int256;
    using PerpMath for uint256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;

    function initialize(address clearingHouseArg) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        // LOB_CHINC: ClearingHouse Is Not Contract
        require(clearingHouseArg.isContract(), "LOB_CHINC");
        _clearingHouse = clearingHouseArg;
        _vault = IClearingHouse(clearingHouseArg).getVault();
        _accountBalance = IClearingHouse(clearingHouseArg).getAccountBalance();
        _clearingHouseConfig = IClearingHouse(clearingHouseArg).getClearingHouseConfig();
    }

    function liquidateEther(address trader, address baseToken) external payable override nonReentrant {
        //deposit ether
        IVault(_vault).depositEther{ value: msg.value }();
        uint256 freeCollateral = IVault(_vault).getFreeCollateral(address(this));
        uint256 buyingPower = freeCollateral.divRatio(IClearingHouseConfig(_clearingHouseConfig).getImRatio());
        int256 liquidateSize = 0;
        //take position
        uint256 markPrice = IAccountBalance(_accountBalance).getReferencePrice(baseToken);
        uint256 maxLiquidateSize = buyingPower.div(markPrice);
        int256 positionSize = IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
        if (positionSize > 0) {
            if (maxLiquidateSize >= positionSize.abs()) {
                liquidateSize = positionSize;
            } else {
                liquidateSize = maxLiquidateSize.toInt256();
            }
        } else {
            if (maxLiquidateSize >= positionSize.abs()) {
                liquidateSize = positionSize;
            } else {
                liquidateSize = maxLiquidateSize.toInt256().neg256();
            }
        }

        IClearingHouse(_clearingHouse).liquidate(trader, baseToken, liquidateSize);
        //close position
        IClearingHouse(_clearingHouse).closePosition(
            DataTypes.ClosePositionParams({
                baseToken: baseToken,
                sqrtPriceLimitX96: 0,
                oppositeAmountBound: 0,
                deadline: _blockTimestamp() + 120,
                referralCode: ""
            })
        );
        //withdraw
        uint256 newFreeCollateral = IVault(_vault).getFreeCollateral(address(this));
        // LIQ_IPNL: Invalid pnl
        require(newFreeCollateral >= freeCollateral, "LIQ_IPNL");
        IVault(_vault).withdrawAllEther();
        TransferHelper.safeTransferETH(_msgSender(), address(this).balance);
    }
}
