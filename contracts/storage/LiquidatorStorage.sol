// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

abstract contract LiquidatorStorage {
    address internal _clearingHouse;
    address internal _vault;
    address internal _accountBalance;
    address internal _clearingHouseConfig;

    address[10] private __gap1;

    uint256[10] private __gap2;
}
