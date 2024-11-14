// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

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
import { OrderData, OrderEncoder } from "./libs/OrderEncoder.sol";
import { OrderDataResolver } from "./OrderDataResolver.sol";

abstract contract Base7683_v2 is IOriginSettler, IDestinationSettler {
    // ============ Libraries ============
    using SafeERC20 for IERC20;

    // ============ Constants ============

    enum OrderStatus {
        UNFILLED,
        OPENED,
        FILLED,
        SETTLED,
        REFUNDED
    }

    IPermit2 public immutable PERMIT2;
    // TODO - Make an interface
    OrderDataResolver public immutable RESOLVER;

    bytes32 public constant RESOLVED_CROSS_CHAIN_ORDER_TYPEHASH = keccak256(
        "ResolvedCrossChainOrder(address user, uint64 originChainId, uint32 openDeadline, uint32 fillDeadline, Output[] maxSpent, Output[] minReceived, FillInstruction[] fillInstructions)Output(bytes32 token, uint256 amount, bytes32 recipient, uint64 chainId)FillInstruction(uint64 destinationChainId, bytes32 destinationSettler, bytes originData)"
    );

    string public constant witnessTypeString =
        "ResolvedCrossChainOrder witness)ResolvedCrossChainOrder(address user, uint64 originChainId, uint32 openDeadline, uint32 fillDeadline, Output[] maxSpent, Output[] minReceived, FillInstruction[] fillInstructions)Output(bytes32 token, uint256 amount, bytes32 recipient, uint64 chainId)FillInstruction(uint64 destinationChainId, bytes32 destinationSettler, bytes originData)TokenPermissions(address token,uint256 amount)";

    // ============ Public Storage ============

    mapping(address sender => uint256 nonce) public senderNonce;

    mapping(bytes32 orderId => bytes resolvedOrder) public orders;

    mapping(bytes32 orderId => bytes fillerData) public orderFillerData;

    // IDEA - to track the status using a bitmap with more than 3 bits, first 3 bits can be used
    // for statuses specific to this contract UNFILLED, OPENED, FILLED and the rest can be used for statuses particular
    // to the implementation
    mapping(bytes32 orderId => OrderStatus status) public orderStatus;

    // ============ Upgrade Gap ============

    uint256[47] private __GAP;

    // ============ Events ============

    event Filled(bytes32 orderId, bytes originData, bytes fillerData);
    event Settle(bytes32[] orderIds, bytes[] ordersFillerData);
    event Refund(bytes32[] orderIds);
    event Settled(bytes32 orderId, address receiver);
    event Refunded(bytes32 orderId, address receiver);

    // ============ Errors ============

    error OrderOpenExpired();
    error InvalidOrderType(bytes32 orderType);
    error InvalidSenderNonc();
    error InvalidOriginDomain(uint32 originDomain);
    error InvalidOrderId();
    error OrderFillExpired();
    error InvalidOrderDomain();
    error InvalidOrderStatus();
    error InvalidSenderNonce();
    error OrderFillNotExpired();
    error InvalidDomain();
    error InvalidSender();
    error InvalidGaslessOrderSettler();
    error InvalidGaslessOrderOrigin();

    // ============ Constructor ============

    constructor(address _permit2) {
        PERMIT2 = IPermit2(_permit2);
        RESOLVER = new OrderDataResolver();
    }

    // ============ Initializers ============

    // ============ External Functions ============

    /// @notice Opens a gasless cross-chain order on behalf of a user.
    /// @dev To be called by the filler.
    /// @dev This method must emit the Open event
    /// @param order The GaslessCrossChainOrder definition
    /// @param signature The user's signature over the order
    /// NOT USED originFillerData Any filler-defined data required by the settler
    function openFor(GaslessCrossChainOrder calldata order, bytes calldata signature, bytes calldata) external {
        if (block.timestamp > order.openDeadline) revert OrderOpenExpired();
        if (order.originSettler != address(this)) revert InvalidGaslessOrderSettler();
        if (order.originChainId != _localDomain()) revert InvalidGaslessOrderOrigin();

        uint256 currentNonce = senderNonce[order.user];

        (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId) =
            RESOLVER.resolveGaslessOrder(order, senderNonce[order.user], _localDomain());

        _permitTransferFrom(resolvedOrder, signature, currentNonce, address(this));

        orders[orderId] = abi.encode(resolvedOrder);
        orderStatus[orderId] = OrderStatus.OPENED;
        senderNonce[order.user] += 1;

        emit Open(orderId, resolvedOrder);
    }

    /// @notice Opens a cross-chain order
    /// @dev To be called by the user
    /// @dev This method must emit the Open event
    /// @param order The OnchainCrossChainOrder definition
    function open(OnchainCrossChainOrder calldata order) external {
        (ResolvedCrossChainOrder memory resolvedOrder, bytes32 orderId) =
            RESOLVER.resolveOnchainOrder(order, msg.sender, senderNonce[msg.sender], _localDomain());

        for (uint256 i = 0; i < resolvedOrder.minReceived.length; i++) {
            IERC20(TypeCasts.bytes32ToAddress(resolvedOrder.minReceived[i].token)).safeTransferFrom(
                msg.sender, address(this), resolvedOrder.minReceived[i].amount
            );
        }

        orders[orderId] = abi.encode(resolvedOrder);
        orderStatus[orderId] = OrderStatus.OPENED;
        senderNonce[msg.sender] += 1;

        emit Open(orderId, resolvedOrder);
    }

    /// @notice Resolves a specific GaslessCrossChainOrder into a generic ResolvedCrossChainOrder
    /// @dev Intended to improve standardized integration of various order types and settlement contracts
    /// @param order The GaslessCrossChainOrder definition
    /// NOT USED originFillerData Any filler-defined data required by the settler
    /// @return resolvedOrder ResolvedCrossChainOrder hydrated order data including the inputs and outputs of the order
    function resolveFor(
        GaslessCrossChainOrder calldata order,
        bytes calldata
    )
        public
        view
        returns (ResolvedCrossChainOrder memory resolvedOrder)
    {
        (resolvedOrder,) = RESOLVER.resolveGaslessOrder(order, senderNonce[order.user], _localDomain());
    }

    /// @notice Resolves a specific OnchainCrossChainOrder into a generic ResolvedCrossChainOrder
    /// @dev Intended to improve standardized integration of various order types and settlement contracts
    /// @param order The OnchainCrossChainOrder definition
    /// @return resolvedOrder ResolvedCrossChainOrder hydrated order data including the inputs and outputs of the order
    function resolve(OnchainCrossChainOrder calldata order)
        public
        view
        returns (ResolvedCrossChainOrder memory resolvedOrder)
    {
        (resolvedOrder,) = RESOLVER.resolveOnchainOrder(order, msg.sender, senderNonce[msg.sender], _localDomain());
    }

    /// @notice Fills a single leg of a particular order on the destination chain
    /// @param _orderId Unique order identifier for this order
    /// @param _originData Data emitted on the origin to parameterize the fill
    /// @param _fillerData Data provided by the filler to inform the fill or express their preferences. It should
    /// contain the bytes32 encoded address of the receiver which is the used at settlement time
    function fill(bytes32 _orderId, bytes calldata _originData, bytes calldata _fillerData) external virtual {
        if (orderStatus[_orderId] != OrderStatus.UNFILLED) revert InvalidOrderStatus();

        Address.functionDelegateCall(
            address(RESOLVER),
            abi.encodeWithSelector(
                RESOLVER.fillOrder.selector,
                _orderId,
                _originData,
                _fillerData
            )
        );

        orderStatus[_orderId] = OrderStatus.FILLED;
        orderFillerData[_orderId] = _fillerData;

        emit Filled(_orderId, _originData, _fillerData);
    }

    // TODO - Isn't this something implementation specific?
    function settle(bytes32[] calldata _orderIds) external payable {
        bytes[] memory ordersFillerData = new bytes[](_orderIds.length);
        for (uint256 i = 0; i < _orderIds.length; i += 1) {
            if (orderStatus[_orderIds[i]] != OrderStatus.FILLED) revert InvalidOrderStatus();

            orderStatus[_orderIds[i]] = OrderStatus.SETTLED;
            ordersFillerData[i] = orderFillerData[_orderIds[i]];
        }

        _handleSettlement(_orderIds, ordersFillerData);

        emit Settle(_orderIds, ordersFillerData);
    }

    // TODO - Isn't this something implementation specific?
    function refund(GaslessCrossChainOrder[] memory _orders) external payable {
        bytes32[] memory orderIds = new bytes32[](_orders.length);
        for (uint256 i = 0; i < _orders.length; i += 1) {
            bytes32 orderId = RESOLVER.getOrderId(_orders[i]);

            if (orderStatus[orderId] != OrderStatus.UNFILLED) revert InvalidOrderStatus();
            if (block.timestamp <= _orders[i].fillDeadline) revert OrderFillNotExpired();

            orderStatus[orderId] = OrderStatus.REFUNDED;
            orderIds[i] = orderId;
        }

        _handleRefund(orderIds);

        emit Refund(orderIds);
    }

    // TODO - Isn't this something implementation specific?
    function refund(OnchainCrossChainOrder[] memory _orders) external payable {
        bytes32[] memory orderIds = new bytes32[](_orders.length);
        for (uint256 i = 0; i < _orders.length; i += 1) {
            bytes32 orderId = RESOLVER.getOrderId(_orders[i]);

            if (orderStatus[orderId] != OrderStatus.UNFILLED) revert InvalidOrderStatus();
            if (block.timestamp <= _orders[i].fillDeadline) revert OrderFillNotExpired();

            orderStatus[orderId] = OrderStatus.REFUNDED;
            orderIds[i] = orderId;
        }

        _handleRefund(orderIds);

        emit Refund(orderIds);
    }

    // ============ Public Functions ============

    function witnessHash(ResolvedCrossChainOrder memory resolvedOrder) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                RESOLVED_CROSS_CHAIN_ORDER_TYPEHASH,
                resolvedOrder.user,
                resolvedOrder.originChainId,
                resolvedOrder.openDeadline,
                resolvedOrder.fillDeadline,
                resolvedOrder.maxSpent,
                resolvedOrder.minReceived,
                resolvedOrder.fillInstructions
            )
        );
    }

    // ============ Internal Functions ============

    function _getOrderId(OrderData memory orderData) internal pure returns (bytes32) {
        return OrderEncoder.id(orderData);
    }

    function _permitTransferFrom(
        ResolvedCrossChainOrder memory resolvedOrder,
        bytes calldata signature,
        uint256 nonce,
        address receiver
    )
        internal
    {
        ISignatureTransfer.TokenPermissions[] memory permitted =
            new ISignatureTransfer.TokenPermissions[](resolvedOrder.minReceived.length);

        ISignatureTransfer.SignatureTransferDetails[] memory transferDetails =
            new ISignatureTransfer.SignatureTransferDetails[](resolvedOrder.minReceived.length);

        for (uint256 i = 0; i < resolvedOrder.minReceived.length; i++) {
            permitted[i] = ISignatureTransfer.TokenPermissions({
                token: TypeCasts.bytes32ToAddress(resolvedOrder.minReceived[i].token),
                amount: resolvedOrder.minReceived[i].amount
            });
            transferDetails[i] = ISignatureTransfer.SignatureTransferDetails({
                to: receiver,
                requestedAmount: resolvedOrder.minReceived[i].amount
            });
        }

        ISignatureTransfer.PermitBatchTransferFrom memory permit = ISignatureTransfer.PermitBatchTransferFrom({
            permitted: permitted,
            nonce: nonce,
            deadline: resolvedOrder.openDeadline
        });

        PERMIT2.permitWitnessTransferFrom(
            permit, transferDetails, resolvedOrder.user, witnessHash(resolvedOrder), witnessTypeString, signature
        );
    }

    /**
     * @dev This function is meant to be called by the inheriting contract when receiving a settle cross-chain message
     * from a remote domain counterpart
     */
    function _settleOrder(bytes32 _orderId, bytes32 _receiver, uint32 _settlingDomain) internal {
        // OrderData memory orderData = orders[_orderId];

        // if (orderData.destinationDomain != _settlingDomain) revert InvalidDomain();
        // if (orderStatus[_orderId] != OrderStatus.OPENED) revert InvalidOrderStatus();

        // orderStatus[_orderId] = OrderStatus.SETTLED;

        // address receiver = TypeCasts.bytes32ToAddress(_receiver);

        // emit Settled(_orderId, receiver);

        // IERC20(TypeCasts.bytes32ToAddress(orderData.inputToken)).safeTransfer(receiver, orderData.amountIn);
    }

    /**
     * @dev This function is meant to be called by the inheriting contract when receiving a refund cross-chain message
     * from a remote domain counterpart
     */
    function _refundOrder(bytes32 _orderId, uint32 _refundingDomain) internal {
        // OrderData memory orderData = orders[_orderId];

        // if (orderData.destinationDomain != _refundingDomain) revert InvalidDomain();
        // if (orderStatus[_orderId] != OrderStatus.OPENED) revert InvalidOrderStatus();

        // orderStatus[_orderId] = OrderStatus.REFUNDED;

        // address orderSender = TypeCasts.bytes32ToAddress(orderData.sender);

        // emit Refunded(_orderId, orderSender);

        // IERC20(TypeCasts.bytes32ToAddress(orderData.inputToken)).safeTransfer(orderSender, orderData.amountIn);
    }

    /**
     * @dev This function is called during `settle` to handle the settlement of the orders, it is meant to be
     * implemented by the inheriting contract with specific settlement logic. i.e. sending a cross-chain message
     */
    function _handleSettlement(bytes32[] memory _orderIds, bytes[] memory _ordersFillerData) internal virtual;

    /**
     * @dev This function is called during `refund` to handle the refund of the orders, it is meant to be
     * implemented by the inheriting contract with specific refund logic. i.e. sending a cross-chain message
     */
    function _handleRefund(bytes32[] memory _orderIds) internal virtual;

    /**
     * @dev To be implemented by the inheriting contract with specific logic, the address of its remote counterpart and
     * revert if it does not exist
     */
    function _mustHaveRemoteCounterpart(uint32 _domain) internal view virtual returns (bytes32);

    /**
     * @dev To be implemented by the inheriting contract with specific logic, should return the local domain
     */
    function _localDomain() internal view virtual returns (uint32);
}
