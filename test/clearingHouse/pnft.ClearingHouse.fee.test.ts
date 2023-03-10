import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken, InsuranceFund,
    MarketRegistry,
    TestClearingHouse,
    TestERC20,
    Vault, VPool
} from "../../typechain"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse fee updated", () => {
    const [admin, maker, trader, liquidator, priceAdmin] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry

    let accountBalance: AccountBalance
    let vault: Vault
    let insuranceFund: InsuranceFund
    let vPool: VPool
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    const lowerTick: number = 45800
    const upperTick: number = 46400
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse

        accountBalance = fixture.accountBalance
        vault = fixture.vault
        insuranceFund = fixture.insuranceFund as InsuranceFund
        vPool = fixture.vPool as VPool
        marketRegistry = fixture.marketRegistry
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader.address, parseUnits("1000", collateralDecimals))
        await deposit(trader, vault, 1000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)
    })

    it("long fee updated", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther("1000"),
            deadline: ethers.constants.MaxUint256,
        })
        // 
        await clearingHouse.connect(trader).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("0.1"),
        )
        const [, , , , , , , , platformFund] = waffle.provider.getWallets()
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.1"),
        )
        await clearingHouse.connect(trader).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("0.2"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.2"),
        )
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits("96", 18)
        })
        console.log((await vPool.getInsuranceFundFeeRatio(baseToken.address, true)).toString())
        console.log((await vPool.getInsuranceFundFeeRatio(baseToken.address, false)).toString())
        return
        // short 100$
        await clearingHouse.connect(trader).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: false,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("1.238975"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.3"),
        )
        // long 100$
        await clearingHouse.connect(trader).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            oppositeAmountBound: 0,
            amount: parseEther("100"),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })
        expect((await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]).to.eq(
            parseEther("1.238975"),
        )
        expect((await accountBalance.getPnlAndPendingFee(platformFund.address))[0]).to.eq(
            parseEther("0.4"),
        )
        // console.log(formatEther(await accountBalance.getBase(trader.address, baseToken.address)))
        // console.log(formatEther(await accountBalance.getQuote(trader.address, baseToken.address)))
        // const [traderOwedRealizedPnl, traderUnrealizedPnl] = await accountBalance.getPnlAndPendingFee(trader.address)
        // console.log(formatEther(traderOwedRealizedPnl.toString()))
        // console.log(formatEther(traderUnrealizedPnl.toString()))
    })
})
