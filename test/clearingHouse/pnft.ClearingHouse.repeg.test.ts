import { MockContract } from "@eth-optimism/smock"
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig, InsuranceFund,
    MarketRegistry,
    QuoteToken,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault, VPool
} from "../../typechain"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { forwardBothTimestamps } from "../shared/time"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse multiplier", () => {

    const [admin, maker, trader1, trader2, liquidator, priceAdmin, user01, fundingFund, platformFund] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let clearingHouseConfig: ClearingHouseConfig
    let marketRegistry: MarketRegistry
    let accountBalance: TestAccountBalance
    let vault: Vault
    let insuranceFund: InsuranceFund
    let vPool: VPool
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        clearingHouseConfig = fixture.clearingHouseConfig as ClearingHouseConfig
        accountBalance = fixture.accountBalance as TestAccountBalance
        vault = fixture.vault
        insuranceFund = fixture.insuranceFund as InsuranceFund
        vPool = fixture.vPool as VPool
        marketRegistry = fixture.marketRegistry
        pool = fixture.pool as UniswapV3Pool
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()

        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader1.address, parseUnits("1000", collateralDecimals))
        await deposit(trader1, vault, 1000, collateral)

        await collateral.mint(trader2.address, parseUnits("1000", collateralDecimals))
        await deposit(trader2, vault, 1000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000", collateralDecimals))
        await deposit(liquidator, vault, 1000, collateral)

        await clearingHouseConfig.setDurationRepegOverPriceSpread(0)
    })

    it("repeg up", async () => {
        await forwardBothTimestamps(clearingHouse, 100)

        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('10000'),
            deadline: ethers.constants.MaxUint256,
        })

        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits("120", 18)
        })

        await forwardBothTimestamps(clearingHouse, 100)

        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("10"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("10"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }

        {
            let unrealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[1]
            let unrealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[1]
            console.log(
                'before repeg unrealizedPnl',
                formatEther(unrealizedPnlTrade1),
                formatEther(unrealizedPnlTrade2),
            )
        }

        await forwardBothTimestamps(clearingHouse, 100)

        console.log("before repeg");
        await clearingHouse.connect(maker).repeg(baseToken.address);
        console.log("after repeg");

        {
            let unrealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[1]
            let unrealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[1]
            console.log(
                'after repeg unrealizedPnl',
                formatEther(unrealizedPnlTrade1),
                formatEther(unrealizedPnlTrade2),
            )
        }

        await clearingHouse.connect(trader1).closePosition({
            baseToken: baseToken.address,
            sqrtPriceLimitX96: parseEther("0"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        await clearingHouse.connect(trader2).closePosition({
            baseToken: baseToken.address,
            sqrtPriceLimitX96: parseEther("0"),
            oppositeAmountBound: parseEther("0"),
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        let owedRealizedPnlPlatformFund = (await accountBalance.getPnlAndPendingFee(platformFund.address))[0]
        let owedRealizedPnlInsuranceFund = (await accountBalance.getPnlAndPendingFee(insuranceFund.address))[0]
        let owedRealizedPnlTrade1 = (await accountBalance.getPnlAndPendingFee(trader1.address))[0]
        let owedRealizedPnlTrade2 = (await accountBalance.getPnlAndPendingFee(trader2.address))[0]

        console.log(
            'owedRealizedPnl',
            formatEther(owedRealizedPnlPlatformFund),
            formatEther(owedRealizedPnlInsuranceFund),
            formatEther(owedRealizedPnlTrade1),
            formatEther(owedRealizedPnlTrade2),
            formatEther(owedRealizedPnlPlatformFund.add(owedRealizedPnlInsuranceFund).add(owedRealizedPnlTrade1).add(owedRealizedPnlTrade2)),
        )
    })

})
