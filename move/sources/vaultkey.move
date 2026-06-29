
module vaultkey::vault {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;

    const ENotOwner: u64 = 0;
    const EAlreadyDeleted: u64 = 1;

    public struct VaultEntry has key, store {
        id: UID,
        label: String,
        blob_id: String,
        policy: String,
        owner: address,
        created_at: u64,
        seal_id: String,
        allowlist_id: String,
    }

    public struct VaultCap has key, store {
        id: UID,
        entry_id: ID,
        owner: address,
    }

    public struct SecretStored has copy, drop {
        entry_id: ID,
        label: String,
        policy: String,
        owner: address,
    }

    public struct SecretDeleted has copy, drop {
        entry_id: ID,
        owner: address,
    }

    public fun store_secret(
        label: String,
        blob_id: String,
        policy: String,
        seal_id: String,
        allowlist_id: String,
        created_at: u64,
        ctx: &mut TxContext,
    ): (VaultEntry, VaultCap) {
        let owner = tx_context::sender(ctx);

        let entry = VaultEntry {
            id: object::new(ctx),
            label,
            blob_id,
            policy,
            owner,
            created_at,
            seal_id,
            allowlist_id,
        };

        let entry_id = object::id(&entry);

        let cap = VaultCap {
            id: object::new(ctx),
            entry_id,
            owner,
        };

        event::emit(SecretStored {
            entry_id,
            label: entry.label,
            policy: entry.policy,
            owner,
        });

        (entry, cap)
    }

    entry fun store_and_keep(
        label: String,
        blob_id: String,
        policy: String,
        seal_id: String,
        allowlist_id: String,
        created_at: u64,
        ctx: &mut TxContext,
    ) {
        let (entry, cap) = store_secret(label, blob_id, policy, seal_id, allowlist_id, created_at, ctx);
        let sender = tx_context::sender(ctx);
        transfer::transfer(entry, sender);
        transfer::transfer(cap, sender);
    }

    entry fun delete_secret(
        entry: VaultEntry,
        cap: VaultCap,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(entry.owner == sender, ENotOwner);
        assert!(cap.entry_id == object::id(&entry), EAlreadyDeleted);

        let entry_id = object::id(&entry);

        event::emit(SecretDeleted { entry_id, owner: sender });

        let VaultEntry { id, label: _, blob_id: _, policy: _, owner: _, created_at: _, seal_id: _, allowlist_id: _ } = entry;
        object::delete(id);

        let VaultCap { id: cap_id, entry_id: _, owner: _ } = cap;
        object::delete(cap_id);
    }

    public fun blob_id(entry: &VaultEntry): &String { &entry.blob_id }
    public fun label(entry: &VaultEntry): &String { &entry.label }
    public fun owner(entry: &VaultEntry): address { entry.owner }
    public fun policy(entry: &VaultEntry): &String { &entry.policy }
    public fun seal_id(entry: &VaultEntry): &String { &entry.seal_id }
    public fun allowlist_id(entry: &VaultEntry): &String { &entry.allowlist_id }
    public fun entry_id(cap: &VaultCap): ID { cap.entry_id }
    public fun cap_owner(cap: &VaultCap): address { cap.owner }
    public fun vault_entry_id(entry: &VaultEntry): ID { object::id(entry) }
}

module vaultkey::owner_policy {
    use vaultkey::vault::{VaultEntry, owner};
    use sui::tx_context::{Self, TxContext};

    const ENotOwner: u64 = 0;

    entry fun seal_approve(
        id: vector<u8>,
        entry: &VaultEntry,
        ctx: &TxContext,
    ) {
        let _ = id;
        let sender = tx_context::sender(ctx);
        assert!(owner(entry) == sender, ENotOwner);
    }
}


// MODULE 3: allowlist
// Owner maintains a whitelist of addresses that can decrypt.
//
//   • TeamMembership NFT/object — minted to members on add, burned on remove.
//     Lets members discover their teams via getOwnedObjects().
//   • SecretKey dynamic field — links VaultEntry IDs to the Allowlist.
//     Lets members discover secrets via getDynamicFields().
//   • link_secret / unlink_secret — called atomically with store/delete.
module vaultkey::allowlist {
    use std::string::String;
    use sui::object::{Self, UID, ID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::dynamic_field as df;
    use vaultkey::vault::VaultEntry;

    const ENotOwner: u64 = 0;
    const ENotOnAllowlist: u64 = 1;

    public struct Allowlist has key {
        id: UID,
        owner: address,
        name: String,
    }

    public struct AllowlistCap has key, store {
        id: UID,
        list_id: ID,
    }

    public struct MemberKey has copy, store, drop { addr: address }

    public struct SecretKey has copy, store, drop { entry_id: ID }

    // ── Membership NFT: owned by team members 
    // Transferred to a member when add_member is called.
    // Lets them discover their teams via getOwnedObjects().
    // When remove_member is called, the NFT in their wallet
    // goes stale (they see the team but seal_approve denies them).
    // They can call burn_membership() to clean up.
    public struct TeamMembership has key, store {
        id: UID,
        list_id: ID,
        team_name: String,
        added_by: address,
    }

    entry fun create_allowlist(name: String, ctx: &mut TxContext) {
        let owner = tx_context::sender(ctx);
        let list = Allowlist {
            id: object::new(ctx),
            owner,
            name,
        };
        let list_id = object::id(&list);
        let cap = AllowlistCap {
            id: object::new(ctx),
            list_id,
        };
        transfer::share_object(list);
        transfer::transfer(cap, owner);
    }

    entry fun add_member(
        list: &mut Allowlist,
        _cap: &AllowlistCap,
        member: address,
        ctx: &mut TxContext,
    ) {
        assert!(list.owner == tx_context::sender(ctx), ENotOwner);
        if (!df::exists(&list.id, MemberKey { addr: member })) {
            df::add(&mut list.id, MemberKey { addr: member }, true);
            // Mint membership NFT so the member can discover this team
            let membership = TeamMembership {
                id: object::new(ctx),
                list_id: object::id(list),
                team_name: list.name,
                added_by: tx_context::sender(ctx),
            };
            transfer::transfer(membership, member);
        }
    }

    // Their TeamMembership NFT goes stale — they can burn it themselves.
    entry fun remove_member(
        list: &mut Allowlist,
        _cap: &AllowlistCap,
        member: address,
        ctx: &TxContext,
    ) {
        assert!(list.owner == tx_context::sender(ctx), ENotOwner);
        if (df::exists(&list.id, MemberKey { addr: member })) {
            df::remove<MemberKey, bool>(&mut list.id, MemberKey { addr: member });
        }
    }

    // ── Burn a stale TeamMembership NFT 
    // Called by a removed member to clean up their wallet.
    entry fun burn_membership(membership: TeamMembership, _ctx: &TxContext) {
        let TeamMembership { id, list_id: _, team_name: _, added_by: _ } = membership;
        object::delete(id);
    }

    // ── Link a VaultEntry to this Allowlist ───────────────────
    // Called atomically in the same PTB as store_secret().
    // Adds a SecretKey dynamic field so members can discover secrets
    // via suiClient.getDynamicFields({ parentId: allowlistId }).
    public fun link_secret(
        list: &mut Allowlist,
        cap: &AllowlistCap,
        entry: &VaultEntry,
        _ctx: &mut TxContext,
    ) {
        assert!(cap.list_id == object::id(list), ENotOwner);
        let entry_id = vaultkey::vault::vault_entry_id(entry);
        if (!df::exists(&list.id, SecretKey { entry_id })) {
            df::add(&mut list.id, SecretKey { entry_id }, true);
        }
    }

    // ── Unlink a VaultEntry from this Allowlist 
    // Called atomically in the same PTB as delete_secret().
    public fun unlink_secret(
        list: &mut Allowlist,
        cap: &AllowlistCap,
        entry_id: ID,
        _ctx: &mut TxContext,
    ) {
        assert!(cap.list_id == object::id(list), ENotOwner);
        if (df::exists(&list.id, SecretKey { entry_id })) {
            df::remove<SecretKey, bool>(&mut list.id, SecretKey { entry_id });
        }
    }

    // Passes if the sender is the list owner OR is a member.
    entry fun seal_approve(
        id: vector<u8>,
        list: &Allowlist,
        ctx: &TxContext,
    ) {
        let _ = id;
        let sender = tx_context::sender(ctx);
        if (list.owner == sender) { return };
        assert!(
            df::exists(&list.id, MemberKey { addr: sender }),
            ENotOnAllowlist
        );
    }

    public fun list_owner(list: &Allowlist): address { list.owner }
    public fun list_id(cap: &AllowlistCap): ID { cap.list_id }
    public fun membership_list_id(m: &TeamMembership): ID { m.list_id }
    public fun membership_team_name(m: &TeamMembership): &String { &m.team_name }
}


// MODULE 4: timelock
// The secret becomes decryptable by ANYONE after a chosen
// timestamp. Great for dead-man switches, escrow reveals,
// audit log drops.
// ────────────────────────────────────────────────────────────
module vaultkey::timelock {
    use sui::clock::{Self, Clock};
    use sui::tx_context::{Self, TxContext};
    use sui::bcs;

    const ENotUnlockedYet: u64 = 0;

    entry fun seal_approve(
        id: vector<u8>,
        clock: &Clock,
        _ctx: &TxContext,
    ) {
        let mut bcs_val = bcs::new(id);
        let unlock_ms = bcs::peel_u64(&mut bcs_val);
        let now_ms = clock::timestamp_ms(clock);
        assert!(now_ms >= unlock_ms, ENotUnlockedYet);
    }

    // Variant: owner can decrypt early; anyone else must wait.
    entry fun seal_approve_with_early_owner(
        id: vector<u8>,
        clock: &Clock,
        owner: address,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        if (sender == owner) { return };
        let mut bcs_val = bcs::new(id);
        let unlock_ms = bcs::peel_u64(&mut bcs_val);
        let now_ms = clock::timestamp_ms(clock);
        assert!(now_ms >= unlock_ms, ENotUnlockedYet);
    }
}


//
// MODULE 5: tests
// Run with: sui move test
#[test_only]
module vaultkey::tests {
    use std::string;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use vaultkey::vault::{Self, VaultEntry, VaultCap};
    use vaultkey::owner_policy;
    use vaultkey::allowlist::{Self, Allowlist, AllowlistCap, TeamMembership};
    use vaultkey::timelock;

    const OWNER: address = @0xA1;
    const STRANGER: address = @0xB2;
    const MEMBER: address = @0xC3;

    // ── Test: store + owner can decrypt ──────────────────────
    #[test]
    fun test_owner_access() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            vault::store_and_keep(
                string::utf8(b"My API Key"),
                string::utf8(b"walrus-blob-abc123"),
                string::utf8(b"owner"),
                string::utf8(b"0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
                string::utf8(b""),
                0,
                ctx,
            );
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let entry = ts::take_from_sender<VaultEntry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            owner_policy::seal_approve(b"test-id", &entry, ctx);
            ts::return_to_sender(&scenario, entry);
        };

        ts::end(scenario);
    }

    // ── Test: stranger cannot decrypt ─────────────────────────
    #[test]
    #[expected_failure(abort_code = 0)]
    fun test_owner_denies_stranger() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            vault::store_and_keep(
                string::utf8(b"My API Key"),
                string::utf8(b"walrus-blob-abc123"),
                string::utf8(b"owner"),
                string::utf8(b"0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"),
                string::utf8(b""),
                0,
                ctx,
            );
        };

        ts::next_tx(&mut scenario, STRANGER);
        {
            let entry = ts::take_from_address<VaultEntry>(&scenario, OWNER);
            let ctx = ts::ctx(&mut scenario);
            owner_policy::seal_approve(b"test-id", &entry, ctx);
            ts::return_to_address(OWNER, entry);
        };

        ts::end(scenario);
    }

    // ── Test: allowlist add + member receives NFT + access ────
    #[test]
    fun test_allowlist_member_access() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            allowlist::create_allowlist(string::utf8(b"Backend Team"), ctx);
        };

        // Add member — should mint TeamMembership NFT to MEMBER
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut list = ts::take_shared<Allowlist>(&scenario);
            let cap = ts::take_from_sender<AllowlistCap>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            allowlist::add_member(&mut list, &cap, MEMBER, ctx);
            ts::return_shared(list);
            ts::return_to_sender(&scenario, cap);
        };

        // Member should have received a TeamMembership NFT
        ts::next_tx(&mut scenario, MEMBER);
        {
            let membership = ts::take_from_sender<TeamMembership>(&scenario);
            ts::return_to_sender(&scenario, membership);
        };

        // Member's seal_approve should pass
        ts::next_tx(&mut scenario, MEMBER);
        {
            let list = ts::take_shared<Allowlist>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            allowlist::seal_approve(b"test-id", &list, ctx);
            ts::return_shared(list);
        };

        ts::end(scenario);
    }

    // ── Test: stranger NOT on allowlist is denied ─────────────
    #[test]
    #[expected_failure(abort_code = 1)]
    fun test_allowlist_denies_stranger() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            allowlist::create_allowlist(string::utf8(b"Backend Team"), ctx);
        };

        ts::next_tx(&mut scenario, STRANGER);
        {
            let list = ts::take_shared<Allowlist>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            allowlist::seal_approve(b"test-id", &list, ctx);
            ts::return_shared(list);
        };

        ts::end(scenario);
    }

    // ── Test: member can burn stale membership NFT ────────────
    #[test]
    fun test_burn_membership() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            allowlist::create_allowlist(string::utf8(b"Backend Team"), ctx);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut list = ts::take_shared<Allowlist>(&scenario);
            let cap = ts::take_from_sender<AllowlistCap>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            allowlist::add_member(&mut list, &cap, MEMBER, ctx);
            ts::return_shared(list);
            ts::return_to_sender(&scenario, cap);
        };

        // Member burns their membership NFT
        ts::next_tx(&mut scenario, MEMBER);
        {
            let membership = ts::take_from_sender<TeamMembership>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            allowlist::burn_membership(membership, ctx);
        };

        ts::end(scenario);
    }

    // ── Test: timelock opens after unlock time 
    #[test]
    fun test_timelock_unlocks() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            clock::set_for_testing(&mut clock, 2000);
            let ctx = ts::ctx(&mut scenario);
            let id = sui::bcs::to_bytes(&1000u64);
            timelock::seal_approve(id, &clock, ctx);
            clock::destroy_for_testing(clock);
        };

        ts::end(scenario);
    }

    // ── Test: timelock blocks before unlock time 
    #[test]
    #[expected_failure(abort_code = 0)]
    fun test_timelock_blocked() {
        let mut scenario = ts::begin(OWNER);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            clock::set_for_testing(&mut clock, 500);
            let ctx = ts::ctx(&mut scenario);
            let id = sui::bcs::to_bytes(&9999u64);
            timelock::seal_approve(id, &clock, ctx);
            clock::destroy_for_testing(clock);
        };

        ts::end(scenario);
    }
}
