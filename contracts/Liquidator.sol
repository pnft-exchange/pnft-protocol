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
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
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
        //approve max
        address settlementToken = IVault(_vault).getSettlementToken();
        IERC20Upgradeable(settlementToken).approve(_vault, type(uint256).max);
    }

    function liquidate(address trader, address baseToken, uint256 amount) external override nonReentrant {
        //deposit
        address settlementToken = IVault(_vault).getSettlementToken();
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(settlementToken), _msgSender(), address(this), amount);

        IVault(_vault).deposit(settlementToken, amount);

        uint256 freeCollateral = IVault(_vault).getFreeCollateral(address(this));
        console.log(freeCollateral);
        uint256 buyingPower = freeCollateral.divRatio(IClearingHouseConfig(_clearingHouseConfig).getImRatio());
        int256 liquidateSize = 0;
        //take position
        uint256 markPrice = IAccountBalance(_accountBalance).getReferencePrice(baseToken);
        uint256 maxLiquidateSize = buyingPower.mul(1e18).div(markPrice);
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
        positionSize = IAccountBalance(_accountBalance).getTakerPositionSize(address(this), baseToken);
        console.logInt(positionSize);
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
        console.log(newFreeCollateral);
        // LIQ_IPNL: Invalid pnl
        require(newFreeCollateral >= freeCollateral, "LIQ_IPNL");

        //withdraw
        IVault(_vault).withdraw(settlementToken, newFreeCollateral);
        console.log(IERC20Upgradeable(settlementToken).balanceOf(address(this)));
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(settlementToken),
            _msgSender(),
            IERC20Upgradeable(settlementToken).balanceOf(address(this))
        );
    }

    function liquidateEther(address trader, address baseToken) external payable override nonReentrant {
        //deposit ether
        IVault(_vault).depositEther{ value: msg.value }();
        console.log(address(this).balance);
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
        console.log(address(this).balance);
        TransferHelper.safeTransferETH(_msgSender(), address(this).balance);
    }
}
