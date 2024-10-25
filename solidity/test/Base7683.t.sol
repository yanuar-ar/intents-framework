// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { Test, Vm } from "forge-std/Test.sol";
import { console2 } from "forge-std/console2.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DeployPermit2} from "@uniswap/permit2/test/utils/DeployPermit2.sol";
import { TypeCasts } from "@hyperlane-xyz/libs/TypeCasts.sol";

import {
    GaslessCrossChainOrder,
    OnchainCrossChainOrder,
    ResolvedCrossChainOrder,
    Output,
    FillInstruction
} from "../src/ERC7683/IERC7683.sol";
import { OrderData, OrderEncoder } from "../src/libs/OrderEncoder.sol";
import { Base7683 } from "../src/Router7683.sol";

event Open(bytes32 indexed orderId, ResolvedCrossChainOrder resolvedOrder);

contract Base7683ForTest is Base7683 {
    bytes32 public counterpart;

    constructor(address _permit2) Base7683(_permit2) {}

    function setCounterpart(bytes32 _counterpart) public {
        counterpart = _counterpart;
    }

    function _mustHaveRemoteCounterpart(uint32 _domain) internal virtual override view returns (bytes32) {
        return counterpart;
    }

    function _localDomain() internal virtual override view returns (uint32) {
        return 1;
    }

    function localDomain() public view returns (uint32) {
        return _localDomain();
    }
}

contract Base7683Test is Test, DeployPermit2 {
    Base7683ForTest internal base;
    address permit2;
    ERC20 internal inputToken;
    ERC20 internal outputToken;

    address internal kakaroto = makeAddr("kakaroto");
    address internal karpincho = makeAddr("karpincho");
    address internal vegeta = makeAddr("vegeta");
    address internal counterpart = makeAddr("counterpart");

    uint32 internal origin = 1;
    uint32 internal destination = 2;
    uint256 internal amount = 100;

    address[] internal users;

    function setUp() public {
        inputToken = new ERC20("Input Token", "IN");
        outputToken = new ERC20("Output Token", "OUT");
        permit2 = deployPermit2();
        base = new Base7683ForTest(permit2);
        base.setCounterpart(TypeCasts.addressToBytes32(counterpart));

        deal(address(inputToken), kakaroto, 1000000, true);
        deal(address(inputToken), karpincho, 1000000, true);
        deal(address(inputToken), vegeta, 1000000, true);

        users.push(kakaroto);
        users.push(karpincho);
        users.push(vegeta);
    }

    function prepareOrderData() internal returns (OrderData memory) {
        return OrderData({
            sender: TypeCasts.addressToBytes32(kakaroto),
            recipient: TypeCasts.addressToBytes32(karpincho),
            inputToken: TypeCasts.addressToBytes32(address(inputToken)),
            outputToken: TypeCasts.addressToBytes32(address(outputToken)),
            amountIn: amount,
            amountOut: amount,
            senderNonce: base.senderNonce(kakaroto),
            originDomain: origin,
            destinationDomain: destination,
            fillDeadline: uint32(block.timestamp + 100),
            data: new bytes(0)
        });
    }

    function prepareOnchainOrder(OrderData memory orderData, uint32 fillDeadline, bytes32 orderDataType) internal returns (OnchainCrossChainOrder memory) {
        return OnchainCrossChainOrder({
            fillDeadline: fillDeadline,
            orderDataType: orderDataType,
            orderData: OrderEncoder.encode(orderData)
        });
    }

    function prepareGaslessOrder(OrderData memory orderData, uint32 openDeadline, uint32 fillDeadline, bytes32 orderDataType) internal returns (GaslessCrossChainOrder memory) {
        return GaslessCrossChainOrder({
            originSettler: address(base),
            user: kakaroto,
            nonce: base.senderNonce(kakaroto),
            originChainId: uint64(origin),
            openDeadline: openDeadline,
            fillDeadline: fillDeadline,
            orderDataType: orderDataType,
            orderData: OrderEncoder.encode(orderData)
        });
    }

    function assertResolvedOrder(
      ResolvedCrossChainOrder memory resolvedOrder,
      OrderData memory orderData,
      address _user,
      uint32 _fillDeadline,
      uint32 _openDeadline
    ) internal view {
        assertEq(resolvedOrder.maxSpent.length, 1);
        assertEq(resolvedOrder.maxSpent[0].token, TypeCasts.addressToBytes32(address(outputToken)));
        assertEq(resolvedOrder.maxSpent[0].amount, amount);
        assertEq(resolvedOrder.maxSpent[0].recipient, base.counterpart());
        assertEq(resolvedOrder.maxSpent[0].chainId, destination);

        assertEq(resolvedOrder.minReceived.length, 1);
        assertEq(resolvedOrder.minReceived[0].token, TypeCasts.addressToBytes32(address(inputToken)));
        assertEq(resolvedOrder.minReceived[0].amount, amount);
        assertEq(resolvedOrder.minReceived[0].recipient, bytes32(0));
        assertEq(resolvedOrder.minReceived[0].chainId, origin);

        assertEq(resolvedOrder.fillInstructions.length, 1);
        assertEq(resolvedOrder.fillInstructions[0].destinationChainId, destination);
        assertEq(resolvedOrder.fillInstructions[0].destinationSettler, base.counterpart());

        orderData.fillDeadline = _fillDeadline;
        assertEq(resolvedOrder.fillInstructions[0].originData, OrderEncoder.encode(orderData));

        assertEq(resolvedOrder.user, _user);
        assertEq(resolvedOrder.originChainId, base.localDomain());
        assertEq(resolvedOrder.openDeadline, _openDeadline);
        assertEq(resolvedOrder.fillDeadline, _fillDeadline);
    }

    function getOrderIDFromLogs() internal returns (bytes32, ResolvedCrossChainOrder memory) {
        Vm.Log[] memory _logs = vm.getRecordedLogs();

        ResolvedCrossChainOrder memory resolvedOrder;
        bytes32 orderID;
        bytes memory resolvedOrderBytes;

        for (uint256 i = 0; i < _logs.length; i++) {
            Vm.Log memory _log = _logs[i];
            // // Open(bytes32 indexed orderId, ResolvedCrossChainOrder resolvedOrder)

            if (_log.topics[0] != Open.selector) {
                continue;
            }
            orderID = _log.topics[1];

            (
              resolvedOrder
            ) = abi.decode(_log.data, (ResolvedCrossChainOrder));
        }
        return (orderID, resolvedOrder);
    }

    function balances(ERC20 token) internal returns (uint256[] memory) {
        uint256[] memory balances = new uint256[](4);
        balances[0] = token.balanceOf(kakaroto);
        balances[1] = token.balanceOf(karpincho);
        balances[2] = token.balanceOf(vegeta);
        balances[3] = token.balanceOf(address(base));

        return balances;
    }

    function orderDataById(bytes32 orderId) internal view returns(OrderData memory orderData) {
       (
              bytes32 _sender,
              bytes32 _recipient,
              bytes32 _inputToken,
              bytes32 _outputToken,
              uint256 _amountIn,
              uint256 _amountOut,
              uint256 _senderNonce,
              uint32 _originDomain,
              uint32 _destinationDomain,
              uint32 _fillDeadline,
              bytes memory _data
          ) = base.orders(orderId);

          orderData.sender = _sender;
          orderData.recipient = _recipient;
          orderData.inputToken = _inputToken;
          orderData.outputToken = _outputToken;
          orderData.amountIn = _amountIn;
          orderData.amountOut = _amountOut;
          orderData.senderNonce = _senderNonce;
          orderData.originDomain = _originDomain;
          orderData.destinationDomain = _destinationDomain;
          orderData.fillDeadline = _fillDeadline;
          orderData.data = _data;
    }

    function assertOpenOrder(bytes32 orderId, address sender, OrderData memory orderData, uint256[] memory balancesBefore, uint256 userId, uint256 nonceBefore) internal {
          OrderData memory savedOrderData = orderDataById(orderId);
          Base7683.OrderStatus status = base.orderStatus(orderId);

          assertEq(base.senderNonce(sender), nonceBefore + 1);
          assertEq(savedOrderData.sender, orderData.sender);
          assertEq(savedOrderData.recipient, orderData.recipient);
          assertEq(savedOrderData.inputToken, orderData.inputToken);
          assertEq(savedOrderData.outputToken, orderData.outputToken);
          assertEq(savedOrderData.amountIn, orderData.amountIn);
          assertEq(savedOrderData.amountOut, orderData.amountOut);
          assertEq(savedOrderData.senderNonce, orderData.senderNonce);
          assertEq(savedOrderData.originDomain, orderData.originDomain);
          assertEq(savedOrderData.destinationDomain, orderData.destinationDomain);
          assertEq(savedOrderData.fillDeadline, orderData.fillDeadline);
          assertEq(savedOrderData.data, orderData.data);
          assertTrue(status == Base7683.OrderStatus.OPENED);

          uint256[] memory balancesAfter = balances(inputToken);
          assertEq(balancesBefore[userId] - amount, balancesAfter[userId]);
          assertEq(balancesBefore[3] + amount, balancesAfter[3]);
    }

    // open
    function test_open_works(uint32 __fillDeadline) public {
        OrderData memory orderData = prepareOrderData();
        OnchainCrossChainOrder memory order = prepareOnchainOrder(orderData, __fillDeadline, OrderEncoder.orderDataType());

        address[] memory addresses = new address[](2);

        vm.startPrank(karpincho);
        inputToken.approve(address(base), amount);

        uint256 nonceBefore = base.senderNonce(karpincho);
        console2.log("antess1");
        uint256[] memory balancesBefore = balances(inputToken);
        console2.log("antess2");

        vm.recordLogs();
        console2.log("antess3");
        base.open(order);
        console2.log("despues");

        (bytes32 orderId, ResolvedCrossChainOrder memory resolvedOrder) = getOrderIDFromLogs();

        assertResolvedOrder(resolvedOrder, orderData, karpincho, __fillDeadline, type(uint32).max);

        assertOpenOrder(orderId, karpincho, orderData, balancesBefore, 1, nonceBefore);

        vm.stopPrank();
    }

    // openFor

    // resolve
    function test_resolve_works(uint32 _fillDeadline) public {
        OrderData memory orderData = prepareOrderData();
        OnchainCrossChainOrder memory order = prepareOnchainOrder(orderData, _fillDeadline, OrderEncoder.orderDataType());

        vm.prank(karpincho);
        ResolvedCrossChainOrder memory resolvedOrder = base.resolve(order);

        assertResolvedOrder(resolvedOrder, orderData, karpincho, _fillDeadline, type(uint32).max);
    }

    // resolveFor
    function test_resolveFor_works(uint32 _fillDeadline, uint32 _openDeadline) public {
        OrderData memory orderData = prepareOrderData();
        GaslessCrossChainOrder memory order = prepareGaslessOrder(orderData, _openDeadline, _fillDeadline, OrderEncoder.orderDataType());

        vm.prank(karpincho);
        ResolvedCrossChainOrder memory resolvedOrder = base.resolveFor(order, new bytes(0));

        orderData.fillDeadline = _fillDeadline;

        assertResolvedOrder(resolvedOrder, orderData, kakaroto, _fillDeadline, _openDeadline);
    }

    // fill
}
