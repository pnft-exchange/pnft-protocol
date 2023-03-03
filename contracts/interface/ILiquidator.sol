// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface ILiquidator {
    function liquidate(address trader, address baseToken, uint256 amount) external;

    function liquidateEther(address trader, address baseToken) external payable;
}
