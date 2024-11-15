// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { GasRouter } from "@hyperlane-xyz/client/GasRouter.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TypeCasts } from "@hyperlane-xyz/libs/TypeCasts.sol";

import { Base7683_v2 } from "./Base7683_v2.sol";
import { OrderData, OrderEncoder } from "./libs/OrderEncoder.sol";
import { Router7683Message } from "./libs/Route7683Message.sol";

import {
    GaslessCrossChainOrder,
    OnchainCrossChainOrder,
    ResolvedCrossChainOrder,
    Output,
    FillInstruction,
    IOriginSettler,
    IDestinationSettler
} from "./ERC7683/IERC7683.sol";

contract Hyperlane7683 is GasRouter, Base7683_v2 {
    // ============ Libraries ============
    using SafeERC20 for IERC20;

    // ============ Constants ============

    // ============ Public Storage ============

    // ============ Upgrade Gap ============

    uint256[47] private __GAP;

    // ============ Events ============
    event Settle(bytes32[] orderIds, bytes[] ordersFillerData);
    event Refund(bytes32[] orderIds);
    event Settled(bytes32 orderId, address receiver);
    event Refunded(bytes32 orderId, address receiver);

    // ============ Errors ============

    error InvalidOrderOrigin();
    error InvalidOrderType(bytes32 orderType);
    error InvalidOriginDomain(uint32 originDomain);
    error InvalidOrderId();
    error OrderFillExpired();
    error InvalidOrderDomain();
    error OrderFillNotExpired();
    error InvalidDomain();
    error InvalidSender();

    // ============ Modifiers ============

    // ============ Constructor ============

    constructor(address _mailbox, address _permit2) GasRouter(_mailbox) Base7683_v2(_permit2) { }

    // ============ Initializers ============

    /**
     * @notice Initializes the contract with HyperlaneConnectionClient contracts
     * @param _customHook used by the Router to set the hook to override with
     * @param _interchainSecurityModule The address of the local ISM contract
     * @param _owner The address with owner privileges
     */
    function initialize(address _customHook, address _interchainSecurityModule, address _owner) external initializer {
        _MailboxClient_initialize(_customHook, _interchainSecurityModule, _owner);
    }

    // ============ External Functions ============
    function settle(bytes32[] calldata _orderIds) external payable {
        bytes memory originData = filledOrders[_orderIds[0]];

        if (originData.length == 0) revert InvalidOrderOrigin();

        uint32 originDomain = OrderEncoder.decode(originData).originDomain;

        bytes[] memory ordersFillerData = new bytes[](_orderIds.length);
        for (uint256 i = 0; i < _orderIds.length; i += 1) {
            if (orderStatus[_orderIds[i]] != OrderStatus.FILLED) revert InvalidOrderStatus();

            orderStatus[_orderIds[i]] = OrderStatus.SETTLED;
            ordersFillerData[i] = orderFillerData[_orderIds[i]];
        }

        _GasRouter_dispatch(
            originDomain, msg.value, Router7683Message.encodeSettle(_orderIds, ordersFillerData), address(hook)
        );

        emit Settle(_orderIds, ordersFillerData);
    }

    function refund(GaslessCrossChainOrder[] memory _orders) external payable {
        bytes32[] memory orderIds = new bytes32[](_orders.length);
        for (uint256 i = 0; i < _orders.length; i += 1) {
            OrderData memory orderData = OrderEncoder.decode(_orders[i].orderData);
            bytes32 orderId = OrderEncoder.id(orderData);

            if (orderStatus[orderId] != OrderStatus.UNFILLED) revert InvalidOrderStatus();
            if (block.timestamp <= orderData.fillDeadline) revert OrderFillNotExpired();
            if (orderData.destinationDomain != localDomain) revert InvalidOrderDomain();
            _mustHaveRemoteCounterpart(orderData.originDomain);

            orderStatus[orderId] = OrderStatus.REFUNDED;
            orderIds[i] = orderId;
        }

        _handleRefund(orderIds, OrderEncoder.decode(_orders[0].orderData).originDomain);

        emit Refund(orderIds);
    }

    function refund(OnchainCrossChainOrder[] memory _orders) external payable {
        bytes32[] memory orderIds = new bytes32[](_orders.length);
        for (uint256 i = 0; i < _orders.length; i += 1) {
            OrderData memory orderData = OrderEncoder.decode(_orders[i].orderData);
            bytes32 orderId = OrderEncoder.id(orderData);

            if (orderStatus[orderId] != OrderStatus.UNFILLED) revert InvalidOrderStatus();
            if (block.timestamp <= orderData.fillDeadline) revert OrderFillNotExpired();
            if (orderData.destinationDomain != localDomain) revert InvalidOrderDomain();
            _mustHaveRemoteCounterpart(orderData.originDomain);

            orderStatus[orderId] = OrderStatus.REFUNDED;
            orderIds[i] = orderId;
        }

        _handleRefund(orderIds, OrderEncoder.decode(_orders[0].orderData).originDomain);

        emit Refund(orderIds);
    }

    // ============ Internal Functions ============

    function _handle(uint32 _origin, bytes32, bytes calldata _message) internal virtual override {
        (bool _settle, bytes32[] memory _orderIds, bytes[] memory _ordersFillerData) =
            Router7683Message.decode(_message);

        for (uint256 i = 0; i < _orderIds.length; i++) {
            // check if the order is opened to ensure it belongs to this domain, skip otherwise
            if (orderStatus[_orderIds[i]] != OrderStatus.OPENED) continue;

            if (_settle) {
                _settleOrder(_orderIds[i], abi.decode(_ordersFillerData[i], (bytes32)), _origin);
            } else {
                _refundOrder(_orderIds[i], _origin);
            }
        }
    }

    function _settleOrder(bytes32 _orderId, bytes32 _receiver, uint32 _settlingDomain) internal {
        if (orderStatus[_orderId] != OrderStatus.OPENED) revert InvalidOrderStatus();

        ResolvedCrossChainOrder memory resolvedOrder = abi.decode(orders[_orderId], (ResolvedCrossChainOrder));

        OrderData memory orderData = OrderEncoder.decode(resolvedOrder.fillInstructions[0].originData);

        if (orderData.destinationDomain != _settlingDomain) revert InvalidDomain();

        orderStatus[_orderId] = OrderStatus.SETTLED;

        address receiver = TypeCasts.bytes32ToAddress(_receiver);

        emit Settled(_orderId, receiver);

        IERC20(TypeCasts.bytes32ToAddress(orderData.inputToken)).safeTransfer(receiver, orderData.amountIn);
    }

    function _refundOrder(bytes32 _orderId, uint32 _refundingDomain) internal {
        if (orderStatus[_orderId] != OrderStatus.OPENED) revert InvalidOrderStatus();

        ResolvedCrossChainOrder memory resolvedOrder = abi.decode(orders[_orderId], (ResolvedCrossChainOrder));

        OrderData memory orderData = OrderEncoder.decode(resolvedOrder.fillInstructions[0].originData);

        if (orderData.destinationDomain != _refundingDomain) revert InvalidDomain();

        orderStatus[_orderId] = OrderStatus.REFUNDED;

        address orderSender = TypeCasts.bytes32ToAddress(orderData.sender);

        emit Refunded(_orderId, orderSender);

        IERC20(TypeCasts.bytes32ToAddress(orderData.inputToken)).safeTransfer(orderSender, orderData.amountIn);
    }

    function _handleRefund(bytes32[] memory _orderIds, uint32 _originDomain) internal virtual {
        _GasRouter_dispatch(_originDomain, msg.value, Router7683Message.encodeRefund(_orderIds), address(hook));
    }

    function _mustHaveRemoteCounterpart(uint32 _domain) internal view virtual returns (bytes32) {
        return _mustHaveRemoteRouter(_domain);
    }

    function _resolveOrder(GaslessCrossChainOrder memory order)
        internal
        view
        virtual
        override
        returns (ResolvedCrossChainOrder memory, bytes32 orderId, uint256 nonce)
    {
        return _resolvedOrder(
            order.orderDataType,
            order.user,
            order.openDeadline,
            order.fillDeadline,
            order.orderData
        );
    }

    /**
     * @dev To be implemented by the inheriting contract with specific logic fot the orderDataType and orderData
     */
    function _resolveOrder(OnchainCrossChainOrder memory order)
        internal
        view
        virtual
        override
        returns (ResolvedCrossChainOrder memory, bytes32 orderId, uint256 nonce)
    {
        return _resolvedOrder(
            order.orderDataType,
            msg.sender,
            type(uint32).max,
            order.fillDeadline,
            order.orderData
        );
    }

    function _resolvedOrder(
        bytes32 _orderType,
        address _sender,
        uint32 _openDeadline,
        uint32 _fillDeadline,
        bytes memory _orderData
    )
        internal
        view
        returns (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId, uint256 nonce)
    {
        if (_orderType != OrderEncoder.orderDataType()) revert InvalidOrderType(_orderType);

        // IDEA: _orderData should not be directly typed as OrderData, it should contain information that is not
        // present on the type used for open the order. So _fillDeadline and _user should be passed as arguments
        OrderData memory orderData = OrderEncoder.decode(_orderData);

        if (orderData.originDomain != localDomain) revert InvalidOriginDomain(orderData.originDomain);
        // if (orderData.sender != TypeCasts.addressToBytes32(_sender)) revert InvalidSender();
        // if (orderData.senderNonce != _senderNonce) revert InvalidSenderNonce();
        bytes32 destinationSettler = _mustHaveRemoteRouter(orderData.destinationDomain);

        // enforce fillDeadline into orderData
        orderData.fillDeadline = _fillDeadline;
        // enforce sender into orderData
        orderData.sender = TypeCasts.addressToBytes32(_sender);

        // this can be used by the filler to approve the tokens to be spent on destination
        Output[] memory maxSpent = new Output[](1);
        maxSpent[0] = Output({
            token: orderData.outputToken,
            amount: orderData.amountOut,
            recipient: destinationSettler,
            chainId: orderData.destinationDomain
        });

        // this can be used by the filler know how much it can expect to receive
        Output[] memory minReceived = new Output[](1);
        minReceived[0] = Output({
            token: orderData.inputToken,
            amount: orderData.amountIn,
            recipient: bytes32(0),
            chainId: orderData.originDomain
        });

        // this can be user by the filler to know how to fill the order
        FillInstruction[] memory fillInstructions = new FillInstruction[](1);
        fillInstructions[0] = FillInstruction({
            destinationChainId: orderData.destinationDomain,
            destinationSettler: destinationSettler,
            originData: OrderEncoder.encode(orderData)
        });

        resolvedOrder = ResolvedCrossChainOrder({
            user: _sender,
            originChainId: localDomain,
            openDeadline: _openDeadline,
            fillDeadline: _fillDeadline,
            minReceived: minReceived,
            maxSpent: maxSpent,
            fillInstructions: fillInstructions
        });

        orderId = OrderEncoder.id(orderData);
        nonce = orderData.senderNonce;
    }

    function _fillOrder(bytes32 _orderId, bytes calldata _originData, bytes calldata) internal override {
        OrderData memory orderData = OrderEncoder.decode(_originData);

        if (_orderId != OrderEncoder.id(orderData)) revert InvalidOrderId();
        if (block.timestamp > orderData.fillDeadline) revert OrderFillExpired();

        IERC20(TypeCasts.bytes32ToAddress(orderData.outputToken)).safeTransferFrom(
            msg.sender, TypeCasts.bytes32ToAddress(orderData.recipient), orderData.amountOut
        );
    }

    function _localDomain() internal view override returns (uint32) {
        return localDomain;
    }
}
