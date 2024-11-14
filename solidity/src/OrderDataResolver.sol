// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TypeCasts } from "@hyperlane-xyz/libs/TypeCasts.sol";
import { IPermit2, ISignatureTransfer } from "@uniswap/permit2/src/interfaces/IPermit2.sol";

import {
    GaslessCrossChainOrder,
    OnchainCrossChainOrder,
    ResolvedCrossChainOrder,
    Output,
    FillInstruction,
    IOriginSettler,
    IDestinationSettler
} from "./ERC7683/IERC7683.sol";
import { OrderData, OrderEncoder } from "./libs/OrderEncoder_v2.sol";


// TODO: When documenting this make sure to mention that this contract should change state because some function are
// called with delegatecall
contract OrderDataResolver {
    using SafeERC20 for IERC20;

    error InvalidOrderType(bytes32 orderType);
    error InvalidSender();
    error InvalidSenderNonce();
    error InvalidOriginDomain(uint32 originDomain);
    error InvalidOrderId();
    error OrderFillExpired();

    function resolveGaslessOrder(
        GaslessCrossChainOrder calldata order,
        uint256 _senderNonce,
        uint32 _localDomain
    )
        public
        pure
        returns (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId)
    {
        return _resolvedOrder(
            order.orderDataType,
            order.user,
            _senderNonce,
            _localDomain,
            order.openDeadline,
            order.fillDeadline,
            order.orderData
        );
    }

    function resolveOnchainOrder(
        OnchainCrossChainOrder calldata order,
        address _sender,
        uint256 _senderNonce,
        uint32 _localDomain
    )
        public
        pure
        returns (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId)
    {
        return _resolvedOrder(
            order.orderDataType,
            _sender,
            _senderNonce,
            _localDomain,
            type(uint32).max,
            order.fillDeadline,
            order.orderData
        );
    }

    function _resolvedOrder(
        bytes32 _orderType,
        address _sender,
        uint256 _senderNonce,
        uint32 _localDomain,
        uint32 _openDeadline,
        uint32 _fillDeadline,
        bytes memory _orderData
    )
        internal
        pure
        returns (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId)
    {
        if (_orderType != OrderEncoder.orderDataType()) revert InvalidOrderType(_orderType);

        // TODO: _orderData should not be directly typed as OrderData, it should contain information that is not
        // present on the type used for open the order. So _fillDeadline and _user should be passed as arguments
        OrderData memory orderData = OrderEncoder.decode(_orderData);

        if (orderData.originChainId != _localDomain) revert InvalidOriginDomain(orderData.originChainId);
        if (orderData.sender != TypeCasts.addressToBytes32(_sender)) revert InvalidSender();
        if (orderData.senderNonce != _senderNonce) revert InvalidSenderNonce();
        // bytes32 destinationSettler = _mustHaveRemoteCounterpart(orderData.destinationDomain);

        // enforce fillDeadline into orderData
        orderData.fillDeadline = _fillDeadline;

        // this can be used by the filler to approve the tokens to be spent on destination
        Output[] memory maxSpent = new Output[](1);
        maxSpent[0] = Output({
            token: orderData.outputToken,
            amount: orderData.amountOut,
            recipient: orderData.destinationSettler,
            chainId: orderData.destinationChainId
        });

        // this can be used by the filler know how much it can expect to receive
        Output[] memory minReceived = new Output[](1);
        minReceived[0] = Output({
            token: orderData.inputToken,
            amount: orderData.amountIn,
            recipient: bytes32(0),
            chainId: orderData.originChainId
        });

        // this can be user by the filler to know how to fill the order
        FillInstruction[] memory fillInstructions = new FillInstruction[](1);
        fillInstructions[0] = FillInstruction({
            destinationChainId: orderData.destinationChainId,
            destinationSettler: orderData.destinationSettler,
            originData: OrderEncoder.encode(orderData)
        });

        resolvedOrder = ResolvedCrossChainOrder({
            user: _sender,
            originChainId: _localDomain,
            openDeadline: _openDeadline,
            fillDeadline: _fillDeadline,
            minReceived: minReceived,
            maxSpent: maxSpent,
            fillInstructions: fillInstructions
        });

        orderId = OrderEncoder.id(orderData);
    }

    function getOrderId(GaslessCrossChainOrder calldata order) external pure returns (bytes32) {
        if (order.orderDataType != OrderEncoder.orderDataType()) revert InvalidOrderType(order.orderDataType);

        // TODO: _orderData should not be directly typed as OrderData, it should contain information that is not
        // present on the type used for open the order. So _fillDeadline and _user should be passed as arguments
        OrderData memory orderData = OrderEncoder.decode(order.orderData);

        return OrderEncoder.id(orderData);
    }

    function getOrderId(OnchainCrossChainOrder calldata order) external pure returns (bytes32) {
        if (order.orderDataType != OrderEncoder.orderDataType()) revert InvalidOrderType(order.orderDataType);

        // TODO: _orderData should not be directly typed as OrderData, it should contain information that is not
        // present on the type used for open the order. So _fillDeadline and _user should be passed as arguments
        OrderData memory orderData = OrderEncoder.decode(order.orderData);

        return OrderEncoder.id(orderData);
    }

    // TODO: docs, make 100% sure this function does not change state because it is called with delegatecall or you
    // know very well what you are doing
    function fillOrder(bytes32 _orderId, bytes calldata _originData, bytes calldata) external {
        OrderData memory orderData = OrderEncoder.decode(_originData);

        if (_orderId != OrderEncoder.id(orderData)) revert InvalidOrderId();
        if (block.timestamp > orderData.fillDeadline) revert OrderFillExpired();

        IERC20(TypeCasts.bytes32ToAddress(orderData.outputToken)).safeTransferFrom(
            msg.sender, TypeCasts.bytes32ToAddress(orderData.recipient), orderData.amountOut
        );
    }
}
