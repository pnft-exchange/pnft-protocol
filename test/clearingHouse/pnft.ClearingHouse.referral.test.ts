import { MockContract } from "@eth-optimism/smock"
import { formatEther, parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    ClearingHouseConfig, InsuranceFund,
    MarketRegistry,
    QuoteToken,
    ReferralPayment,
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

describe("Referral claim", () => {

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
    const initPrice = "1"

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
    })

    it("referral claim", async () => {
        const ReferralPayment = await ethers.getContractFactory("ReferralPayment")
        let referralPayment = (await ReferralPayment.deploy()) as ReferralPayment

        await referralPayment.initialize(collateral.address, admin.address)
        await collateral.mint(referralPayment.address, parseEther('1000'))

        await admin.sendTransaction({
            to: referralPayment.address,
            value: ethers.utils.parseEther("1")
        })

        const deadline = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp + 300

        let user = trader1.address
        let totalPNFT = parseEther('100')
        let totalETH = parseEther('1')

        let messagePack = ethers.utils.defaultAbiCoder.encode(["address", "address", "address", "uint256", "uint256", "uint256"], [referralPayment.address, admin.address, user, totalPNFT, totalETH, deadline])

        let messageHash = ethers.utils.keccak256(ethers.utils.arrayify(messagePack))

        let signature = await admin.signMessage(ethers.utils.arrayify(messageHash))

        await referralPayment.claim(user, totalPNFT, totalETH, deadline, ethers.utils.arrayify(signature))

        console.log(
            'balance',
            formatEther(await collateral.balanceOf(user)),
            formatEther(await ethers.provider.getBalance(user)),
        )

    })

})
