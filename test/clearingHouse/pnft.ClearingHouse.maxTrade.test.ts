import { MockContract } from "@eth-optimism/smock"
import bn from "bignumber.js"
import { BigNumber, ContractReceipt } from "ethers"
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    AccountBalance,
    BaseToken, InsuranceFund,
    MarketRegistry,
    QuoteToken,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault, VPool
} from "../../typechain"
import { initMarket } from "../helper/marketHelper"
import { deposit } from "../helper/token"
import { filterLogs } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse fee updated", () => {

    let getTakerRealizedPnlAndFees = (receipt: ContractReceipt): [BigNumber, BigNumber] => {
        const logs = filterLogs(receipt, clearingHouse.interface.getEventTopic("PositionChanged"), clearingHouse)
        let realizedPnl = BigNumber.from(0)
        let fees = BigNumber.from(0)
        for (const log of logs) {
            realizedPnl = realizedPnl.add(log.args.realizedPnl)
            fees = fees.add(log.args.fee)
        }
        return [realizedPnl, fees]
    }

    const [admin, maker, trader1, trader2, liquidator, priceAdmin] = waffle.provider.getWallets()
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
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let mockedNFTPriceFeed: MockContract
    let collateralDecimals: number
    const initPrice = "100"

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())
        clearingHouse = fixture.clearingHouse as TestClearingHouse
        accountBalance = fixture.accountBalance
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
    })

    it("long fee updated", async () => {
        // maker add liquidity
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            liquidity: parseEther('10000'),
            deadline: ethers.constants.MaxUint256,
        })

        let freeCollateral = await vault.getFreeCollateral(trader1.address);
        console.log(
            'getFreeCollateral',
            formatEther(freeCollateral)
        )
        var isBaseToQuote = true

        let platformFundFeeRatio = (await marketRegistry.getPlatformFundFeeRatio(baseToken.address))
        let insuranceFundFeeRatio = (await vPool.getInsuranceFundFeeRatio(baseToken.address, isBaseToQuote))
        let feeRatio = new bn(platformFundFeeRatio.toString()).plus(new bn(insuranceFundFeeRatio.toString())).toNumber()

        console.log(
            'feeRatio',
            feeRatio,
        )

        await clearingHouse.connect(trader1).openPosition({
            baseToken: baseToken.address,
            isBaseToQuote: isBaseToQuote,
            isExactInput: !isBaseToQuote,
            oppositeAmountBound: 0,
            amount: freeCollateral.mul(5).mul((1000000 - feeRatio)).div(1000000),
            sqrtPriceLimitX96: 0,
            deadline: ethers.constants.MaxUint256,
            referralCode: ethers.constants.HashZero,
        })

        return

        // const liquidity = (await orderBook.getLiquidity(baseToken.address))
        // await clearingHouse.connect(maker).removeLiquidity({
        //     baseToken: baseToken.address,
        //     liquidity,
        //     deadline: ethers.constants.MaxUint256,
        // })

        // return

        // 
        // {
        // {
        //     await clearingHouse.connect(trader1).openPosition({
        //         baseToken: baseToken.address,
        //         isBaseToQuote: true,
        //         isExactInput: false,
        //         oppositeAmountBound: 0,
        //         amount: parseEther("1"),
        //         sqrtPriceLimitX96: 0,
        //         deadline: ethers.constants.MaxUint256,
        //         referralCode: ethers.constants.HashZero,
        //     })
        // }
        //     {
        //         await clearingHouse.connect(trader2).openPosition({
        //             baseToken: baseToken.address,
        //             isBaseToQuote: true,
        //             isExactInput: false,
        //             oppositeAmountBound: 0,
        //             amount: parseEther("100"),
        //             sqrtPriceLimitX96: 0,
        //             deadline: ethers.constants.MaxUint256,
        //             referralCode: ethers.constants.HashZero,
        //         })
        //     }
        //     {
        //         let r = await (
        //             await clearingHouse.connect(trader1).closePosition({
        //                 baseToken: baseToken.address,
        //                 sqrtPriceLimitX96: parseEther("0"),
        //                 oppositeAmountBound: parseEther("0"),
        //                 deadline: ethers.constants.MaxUint256,
        //                 referralCode: ethers.constants.HashZero,
        //             })
        //         ).wait()
        //         let [realizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
        //         console.log('realizedPnl1', formatEther(realizedPnl), formatEther(fees))
        //     }
        //     {
        //         let r = await (
        //             await clearingHouse.connect(trader2).closePosition({
        //                 baseToken: baseToken.address,
        //                 sqrtPriceLimitX96: parseEther("0"),
        //                 oppositeAmountBound: parseEther("0"),
        //                 deadline: ethers.constants.MaxUint256,
        //                 referralCode: ethers.constants.HashZero,
        //             })
        //         ).wait()
        //         let [realizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
        //         console.log('realizedPnl2', formatEther(realizedPnl), formatEther(fees))
        //     }
        // }
        // {
        //     await clearingHouse.connect(trader).openPosition({
        //         baseToken: baseToken.address,
        //         isBaseToQuote: true,
        //         isExactInput: false,
        //         oppositeAmountBound: 0,
        //         amount: parseEther("100"),
        //         sqrtPriceLimitX96: 0,
        //         deadline: ethers.constants.MaxUint256,
        //         referralCode: ethers.constants.HashZero,
        //     })
        //     let r = await (
        //         await clearingHouse.connect(trader).closePosition({
        //             baseToken: baseToken.address,
        //             sqrtPriceLimitX96: parseEther("0"),
        //             oppositeAmountBound: parseEther("0"),
        //             deadline: ethers.constants.MaxUint256,
        //             referralCode: ethers.constants.HashZero,
        //         })
        //     ).wait()
        //     let [realizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
        //     console.log('realizedPnl', formatEther(realizedPnl), formatEther(fees))
        // }
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                oppositeAmountBound: 0,
                amount: parseEther("1"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            await clearingHouse.connect(trader1).closePosition({
                baseToken: baseToken.address,
                sqrtPriceLimitX96: parseEther("0"),
                oppositeAmountBound: parseEther("0"),
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })

            return

            // {
            //     let [owedRealizedPnl, realizedPnl,] = await accountBalance.getPnlAndPendingFee(trader1.address)
            //     console.log('accountBalance trader1', formatEther(owedRealizedPnl), formatEther(realizedPnl))
            // }
            // await clearingHouse.connect(trader2).openPosition({
            //     baseToken: baseToken.address,
            //     isBaseToQuote: false,
            //     isExactInput: true,
            //     oppositeAmountBound: 0,
            //     amount: parseEther("100"),
            //     sqrtPriceLimitX96: 0,
            //     deadline: ethers.constants.MaxUint256,
            //     referralCode: ethers.constants.HashZero,
            // })
            let r = await (
                await clearingHouse.connect(trader1).closePosition({
                    baseToken: baseToken.address,
                    sqrtPriceLimitX96: parseEther("0"),
                    oppositeAmountBound: parseEther("0"),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            ).wait()
            let [txRealizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
            let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader1.address, baseToken.address)
            let totalOpenNotional = await accountBalance.getTotalOpenNotional(trader1.address, baseToken.address)
            let [owedRealizedPnl, realizedPnl,] = await accountBalance.getPnlAndPendingFee(trader1.address)
            console.log('accountBalance trader1', formatEther(owedRealizedPnl), formatEther(realizedPnl), formatEther(txRealizedPnl), formatEther(takerOpenNotional), formatEther(totalOpenNotional))
        }
        return
        {
            await clearingHouse.connect(trader1).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("100"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            {
                let [owedRealizedPnl, realizedPnl,] = await accountBalance.getPnlAndPendingFee(trader1.address)
                console.log('accountBalance trader1', formatEther(owedRealizedPnl), formatEther(realizedPnl))
            }
            await clearingHouse.connect(trader2).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                oppositeAmountBound: 0,
                amount: parseEther("100"),
                sqrtPriceLimitX96: 0,
                deadline: ethers.constants.MaxUint256,
                referralCode: ethers.constants.HashZero,
            })
            let r = await (
                await clearingHouse.connect(trader1).closePosition({
                    baseToken: baseToken.address,
                    sqrtPriceLimitX96: parseEther("0"),
                    oppositeAmountBound: parseEther("0"),
                    deadline: ethers.constants.MaxUint256,
                    referralCode: ethers.constants.HashZero,
                })
            ).wait()
            {
                let [txRealizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
                let takerOpenNotional = await accountBalance.getTakerOpenNotional(trader1.address, baseToken.address)
                let totalOpenNotional = await accountBalance.getTotalOpenNotional(trader1.address, baseToken.address)
                let [owedRealizedPnl, realizedPnl,] = await accountBalance.getPnlAndPendingFee(trader1.address)
                console.log('accountBalance trader1', formatEther(owedRealizedPnl), formatEther(realizedPnl), formatEther(txRealizedPnl), formatEther(takerOpenNotional), formatEther(totalOpenNotional))
            }
        }
        // {
        //     await clearingHouse.connect(trader).openPosition({
        //         baseToken: baseToken.address,
        //         isBaseToQuote: true,
        //         isExactInput: false,
        //         oppositeAmountBound: 0,
        //         amount: parseEther("100"),
        //         sqrtPriceLimitX96: 0,
        //         deadline: ethers.constants.MaxUint256,
        //         referralCode: ethers.constants.HashZero,
        //     })
        //     let r = await (
        //         await clearingHouse.connect(trader).closePosition({
        //             baseToken: baseToken.address,
        //             sqrtPriceLimitX96: parseEther("0"),
        //             oppositeAmountBound: parseEther("0"),
        //             deadline: ethers.constants.MaxUint256,
        //             referralCode: ethers.constants.HashZero,
        //         })
        //     ).wait()
        //     let [realizedPnl, fees] = await getTakerRealizedPnlAndFees(r)
        //     console.log('realizedPnl', formatEther(realizedPnl), formatEther(fees))
        // }
    })
})
