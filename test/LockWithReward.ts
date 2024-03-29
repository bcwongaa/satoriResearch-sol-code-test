import {
  time,
  loadFixture,
} from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import {
  ONE_DAY,
  ONE_THOUSAND,
  TWO_THOUSAND,
  UNIX_TIME_IN_SECOND,
  deployLockWithRewardContractsWithDefaultTokens,
} from '../shared/global';

describe('LockWithReward', function () {
  let contract: any;
  let underlying: any;
  let rewardToken: any;
  let contractOwner: any;
  let contractAdmin: any;
  let tester: any;

  describe('Deployment', async function () {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);
    });

    it('Underlying address matching', async function () {
      expect(await contract.underlying()).to.equal(
        await underlying.getAddress(),
      );
    });

    it('Reward Token address matching', async function () {
      expect(await contract.rewardToken()).to.equal(
        await rewardToken.getAddress(),
      );
    });

    it('Contract Owner address matching', async function () {
      expect(await contract.owner()).to.equal(await contractOwner.getAddress());
    });
  });

  describe('Admin Actions - Before lock time starts', async function () {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);
    });

    it('Admin can change time', async function () {
      const startTime = BigInt(UNIX_TIME_IN_SECOND + 100000);
      const endTime = BigInt(UNIX_TIME_IN_SECOND + 10000000);
      await contract.connect(contractAdmin).setTime(startTime, endTime);
      expect(await contract.startTime()).to.equal(startTime);
      expect(await contract.endTime()).to.equal(endTime);
    });

    it('Admin can change amount threshold', async function () {
      const mantissa = await underlying.decimals();
      const [level1AmountThreshold, level2AmountThreshold] = [
        BigInt(150) * mantissa,
        BigInt(3000) * mantissa,
      ];
      await contract
        .connect(contractAdmin)
        .setLevelAmountThreshold(level1AmountThreshold, level2AmountThreshold);

      expect(await contract.level1AmountThreshold()).to.equal(
        level1AmountThreshold,
      );
      expect(await contract.level2AmountThreshold()).to.equal(
        level2AmountThreshold,
      );
    });

    it('Admin can change lock time threshold', async function () {
      const [level1LockTime, level2LockTime] = [
        BigInt(ONE_DAY * 7),
        BigInt(ONE_DAY * 14),
      ];
      await contract
        .connect(contractAdmin)
        .setLevelLockTime(level1LockTime, level2LockTime);

      expect(await contract.level1LockTime()).to.equal(level1LockTime);
      expect(await contract.level2LockTime()).to.equal(level2LockTime);
    });

    it('Admin cannot change configuration after start time has passed', async function () {
      await time.increase(2000000);
      const newStartTime = BigInt(UNIX_TIME_IN_SECOND + 1000);
      const newEndTime = BigInt(UNIX_TIME_IN_SECOND + 10000);

      await expect(
        contract.connect(contractAdmin).setTime(newStartTime, newEndTime),
      ).to.be.revertedWith('Configuartion cannot be changed after starting');
    });

    it('Users cannot change configuartion', async () => {
      const [level1LockTime, level2LockTime] = [
        BigInt(ONE_DAY * 7),
        BigInt(ONE_DAY * 14),
      ];
      await contract
        .connect(contractAdmin)
        .setLevelLockTime(level1LockTime, level2LockTime);

      await expect(
        contract
          .connect(tester)
          .setLevelLockTime(level1LockTime, level2LockTime),
      ).to.be.reverted;
    });
  });

  describe('Admin Actions - During the lockable period', async () => {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);

      const now = BigInt(UNIX_TIME_IN_SECOND);
      // 1728000 seconds is 20 days
      const endTime = BigInt(UNIX_TIME_IN_SECOND + 1730000);
      await contract.connect(contractAdmin).setTime(now, endTime);
    });

    it('Admin cannot change settings', async () => {
      const [startTime, endTime] = [
        BigInt(UNIX_TIME_IN_SECOND + 10000),
        BigInt(UNIX_TIME_IN_SECOND + 100000),
      ];

      await expect(
        contract.connect(contractAdmin).setTime(startTime, endTime),
      ).to.be.revertedWith('Configuartion cannot be changed after starting');
    });
  });

  describe('Admin Actions - After the lockable period', async () => {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);

      await time.increase(2000000);
    });

    it('Admin cannot change settings', async () => {
      const [startTime, endTime] = [
        BigInt(UNIX_TIME_IN_SECOND + 10000 + 2000000),
        BigInt(UNIX_TIME_IN_SECOND + 100000 + 2000000),
      ];

      await expect(
        contract.connect(contractAdmin).setTime(startTime, endTime),
      ).to.be.revertedWith('Configuartion cannot be changed after starting');
    });
  });

  describe('User Actions - Before Lock Time Starts', async () => {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);
    });

    it('User cannot lock their funds', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await expect(
        contract.connect(tester).lock(ONE_THOUSAND),
      ).to.be.revertedWith('Lock time not started');
    });
  });

  describe('User Actions - During the lockable period', async () => {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);

      const now = BigInt(UNIX_TIME_IN_SECOND);
      // 1728000 seconds is 20 days
      const endTime = BigInt(UNIX_TIME_IN_SECOND + 1730000);
      await contract.connect(contractAdmin).setTime(now, endTime);
    });

    it('User should be able to lock funds', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      const balance = await contract.connect(tester).totalLockedAmount();
      expect(balance).to.be.equal(ONE_THOUSAND);
    });

    it('User should be able to lock funds multiple times', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      const balance = await contract.connect(tester).totalLockedAmount();
      expect(balance).to.be.equal(TWO_THOUSAND);
    });

    it('User should be able to withdraw if they regrets', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      await contract.connect(tester).withdraw();
      const balance = await contract.connect(tester).totalLockedAmount();
      expect(balance).to.be.equal(0);
    });

    it('User should be able to see potential bonus', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      const bonus = await contract.connect(tester).getClaimable();
      expect(bonus).to.be.equal(BigInt(1000 * 1.5 * 1.3 * 1e18));
    });
  });

  describe('User Actions - After lockable period', async () => {
    beforeEach(async () => {
      [
        contract,
        underlying,
        rewardToken,
        contractOwner,
        contractAdmin,
        tester,
      ] = await loadFixture(deployLockWithRewardContractsWithDefaultTokens);

      const now = BigInt(UNIX_TIME_IN_SECOND);
      // 1728000 seconds is 20 days
      const endTime = BigInt(UNIX_TIME_IN_SECOND + 1730000);
      await contract.connect(contractAdmin).setTime(now, endTime);

      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await contract.connect(tester).lock(ONE_THOUSAND);

      await time.increase(2000000);
    });

    it('User should be able to see claimable bonus', async () => {
      const bonus = await contract.connect(tester).getClaimable();
      expect(bonus).to.be.equal(BigInt(1000 * 1.5 * 1.3 * 1e18));
    });

    it('User should be able claim bonus', async () => {
      const orignalUnderlyingBalance = await underlying
        .connect(tester)
        .balanceOf(tester.address);
      const originalRewardBalance = await rewardToken
        .connect(tester)
        .balanceOf(tester.address);

      expect(originalRewardBalance).to.be.equal(0);

      await contract.connect(tester).claimAndWithdraw();
      const currentUnderlyingBalance = await underlying
        .connect(tester)
        .balanceOf(tester.address);
      const currentRewardBalance = await rewardToken
        .connect(tester)
        .balanceOf(tester.address);
      expect(currentUnderlyingBalance).greaterThan(orignalUnderlyingBalance);
      expect(currentRewardBalance).greaterThan(originalRewardBalance);
    });

    it('User should not be able to lock funds', async () => {
      await underlying
        .connect(tester)
        .approve(await contract.getAddress(), ONE_THOUSAND);
      await expect(
        contract.connect(tester).lock(ONE_THOUSAND),
      ).to.be.revertedWith('Lock time has passed');
    });
  });
});
