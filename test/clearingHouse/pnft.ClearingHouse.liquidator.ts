import { MockContract } from "@eth-optimism/smock"
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken,
    InsuranceFund,
    Liquidator,
    MarketRegistry,
    TestClearingHouse,
    TestERC20,
    Vault
} from "../../typechain"
import {
    findPositionLiquidatedEvents
} from "../helper/clearingHouseHelper"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse liquidate trader", () => {
    const [admin, maker, trader1, trader2, liquidator, priceAdmin, user01, fundingFund, platformFund] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let marketRegistry: MarketRegistry
    let accountBalance: AccountBalance
    let insuranceFund: InsuranceFund
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    let liquidatorContract: Liquidator
    const lowerTick: number = 45780
    const upperTick: number = 46440
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture(true, 3000))
        clearingHouse = fixture.clearingHouse as TestClearingHouse

        accountBalance = fixture.accountBalance
        insuranceFund = fixture.insuranceFund as InsuranceFund
        vault = fixture.vault
        marketRegistry = fixture.marketRegistry
        collateral = fixture.WETH
        baseToken = fixture.baseToken
        mockedNFTPriceFeed = fixture.mockedNFTPriceFeed
        collateralDecimals = await collateral.decimals()
        liquidatorContract = fixture.liquidator
        await initMarket(fixture, initPrice, undefined, 0)
        mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
            return parseUnits(initPrice, 18)
        })

        // prepare collateral for trader
        await collateral.mint(trader1.address, parseUnits("10", collateralDecimals))
        await deposit(trader1, vault, 10, collateral)

        await collateral.mint(trader2.address, parseUnits("10000000", collateralDecimals))
        await deposit(trader2, vault, 10000000, collateral)

        await collateral.mint(liquidator.address, parseUnits("1000000000", collateralDecimals))
        await deposit(liquidator, vault, 10000000, collateral)
    })

    it("long liquidate", async () => {
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('100000'),
            deadline: ethers.constants.MaxUint256,
        })
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("48"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: ethers.constants.MaxUint256.div(1e10),
                sqrtPriceLimitX96: encodePriceSqrt('122', '1'),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
        }
        {
            console.log(
                '',
                (await clearingHouse.isLiquidatable(trader1.address))
            )
        }
        //liquidator
        {
            mockedNFTPriceFeed.smocked.getPrice.will.return.with(async () => {
                return parseUnits("122", 18)
            })
            await collateral.connect(liquidator).approve(liquidatorContract.address, parseEther("1000000000"))
            await liquidatorContract.connect(liquidator).liquidate(trader1.address, baseToken.address, parseEther("500"))
        }

    })

})
