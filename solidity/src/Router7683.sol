// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.25;

import { GasRouter } from "@hyperlane-xyz/client/GasRouter.sol";

import { Base7683 } from "./Base7683.sol";
import { OrderData, OrderEncoder } from "./libs/OrderEncoder.sol";
import { Router7683Message} from "./libs/Route7683Message.sol";

contract Router7683 is GasRouter, Base7683 {
    // ============ Libraries ============

    // ============ Constants ============

    // ============ Public Storage ============

    // ============ Upgrade Gap ============

    uint256[47] private __GAP;

    // ============ Events ============

    // ============ Errors ============

    error InvalidOrderOrigin();

    // ============ Modifiers ============

    // ============ Constructor ============

    constructor(address _mailbox, address _permit2) GasRouter(_mailbox) Base7683(_permit2) { }

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

    // ============ Internal Functions ============

    function _handle(uint32 _origin, bytes32, bytes calldata _message) internal virtual override {
        (bool _settle, bytes32[] memory _orderIds, bytes[] memory _ordersFillerData) = Router7683Message.decode(_message);

        for (uint i = 0; i < _orderIds.length; i++) {
            // check if the order is opened to ensure it belongs to this domain, skip otherwise
            if (orderStatus[_orderIds[i]] != OrderStatus.OPENED) continue;

            if (_settle) {
                _settleOrder(_orderIds[i], abi.decode(_ordersFillerData[i], (bytes32)), _origin);
            } else {
                _refundOrder(_orderIds[i], _origin);

            }
        }
    }

    function _handleSettlement(bytes32[] memory _orderIds, bytes[] memory _ordersFillerData) internal virtual override {
        uint32 originDomain = orders[_orderIds[0]].originDomain;
        _GasRouter_dispatch(originDomain, msg.value, Router7683Message.encodeSettle(_orderIds, _ordersFillerData), address(hook));
    }

    function _handleRefund(bytes32[] memory _orderIds) internal virtual override {
        uint32 originDomain = orders[_orderIds[0]].originDomain;
        _GasRouter_dispatch(originDomain, msg.value, Router7683Message.encodeRefund(_orderIds), address(hook));
    }

    function _mustHaveRemoteCounterpart(uint32 _domain) internal view virtual override returns (bytes32) {
        return _mustHaveRemoteRouter(_domain);
    }

    function _localDomain() internal view override returns (uint32) {
        return localDomain;
    }
}
