import { GuildMember, Guild, Role } from 'discord.js';
import config, { ROLE_TIERS } from '../config';
import { blockchain } from './blockchain';
import { database } from './database';
import { Address } from 'viem';

// Role tier type
export type RoleTier = keyof typeof ROLE_TIERS;

// Role update result
export interface RoleUpdateResult {
  added: string[];
  removed: string[];
  currentTier: RoleTier | null;
  balance: string;
}

class RolesService {
  // Get all tier role IDs
  getTierRoleIds(): string[] {
    return Object.values(ROLE_TIERS)
      .map(tier => tier.roleId)
      .filter(id => id !== '');
  }

  // Determine tier based on balance
  getTierForBalance(balance: bigint): RoleTier | null {
    // Convert balance to whole tokens (assuming 18 decimals)
    const balanceInTokens = balance / BigInt(10 ** blockchain.getDecimals());

    if (balanceInTokens >= ROLE_TIERS.GOLD.minBalance) {
      return 'GOLD';
    } else if (balanceInTokens >= ROLE_TIERS.SILVER.minBalance) {
      return 'SILVER';
    } else if (balanceInTokens >= ROLE_TIERS.BRONZE.minBalance) {
      return 'BRONZE';
    }

    return null;
  }

  // Get role by tier
  async getRoleByTier(guild: Guild, tier: RoleTier): Promise<Role | null> {
    const roleId = ROLE_TIERS[tier].roleId;
    if (!roleId) return null;

    try {
      return await guild.roles.fetch(roleId);
    } catch (error) {
      console.error(`Error fetching role for tier ${tier}:`, error);
      return null;
    }
  }

  // Update member roles based on their TOURS balance
  async updateMemberRoles(member: GuildMember): Promise<RoleUpdateResult> {
    const result: RoleUpdateResult = {
      added: [],
      removed: [],
      currentTier: null,
      balance: '0',
    };

    // Get user's linked wallet
    const user = await database.getUser(member.id);
    if (!user?.wallet_address) {
      // Remove all tier roles if no wallet linked
      await this.removeAllTierRoles(member);
      return result;
    }

    try {
      // Get TOURS balance
      const balance = await blockchain.getBalance(user.wallet_address as Address);
      result.balance = blockchain.formatBalance(balance);

      // Determine appropriate tier
      const tier = this.getTierForBalance(balance);
      result.currentTier = tier;

      // Get current tier roles the member has
      const tierRoleIds = this.getTierRoleIds();
      const currentTierRoles = member.roles.cache.filter(role => tierRoleIds.includes(role.id));

      // Remove inappropriate tier roles
      for (const [_, role] of currentTierRoles) {
        const tierForRole = this.getTierForRoleId(role.id);
        if (tierForRole !== tier) {
          await member.roles.remove(role);
          result.removed.push(role.name);
        }
      }

      // Add appropriate tier role if not already present
      if (tier) {
        const tierRoleId = ROLE_TIERS[tier].roleId;
        if (tierRoleId && !member.roles.cache.has(tierRoleId)) {
          const role = await this.getRoleByTier(member.guild, tier);
          if (role) {
            await member.roles.add(role);
            result.added.push(role.name);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error updating member roles:', error);
      throw new Error('Failed to update roles');
    }
  }

  // Get tier for a role ID
  private getTierForRoleId(roleId: string): RoleTier | null {
    for (const [tier, tierConfig] of Object.entries(ROLE_TIERS)) {
      if (tierConfig.roleId === roleId) {
        return tier as RoleTier;
      }
    }
    return null;
  }

  // Remove all tier roles from a member
  async removeAllTierRoles(member: GuildMember): Promise<string[]> {
    const removed: string[] = [];
    const tierRoleIds = this.getTierRoleIds();

    for (const [_, role] of member.roles.cache) {
      if (tierRoleIds.includes(role.id)) {
        await member.roles.remove(role);
        removed.push(role.name);
      }
    }

    return removed;
  }

  // Update roles for all members with linked wallets
  async updateAllMemberRoles(guild: Guild): Promise<Map<string, RoleUpdateResult>> {
    const results = new Map<string, RoleUpdateResult>();

    try {
      // Fetch all members
      await guild.members.fetch();

      for (const [memberId, member] of guild.members.cache) {
        const user = await database.getUser(memberId);
        if (user?.wallet_address) {
          try {
            const result = await this.updateMemberRoles(member);
            results.set(memberId, result);
          } catch (error) {
            console.error(`Error updating roles for ${memberId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error updating all member roles:', error);
    }

    return results;
  }

  // Get tier info for display
  getTierInfo(): Array<{ tier: RoleTier; name: string; minBalance: string }> {
    return Object.entries(ROLE_TIERS).map(([tier, info]) => ({
      tier: tier as RoleTier,
      name: info.name,
      minBalance: info.minBalance.toString(),
    }));
  }

  // Check if roles are properly configured
  async validateRoleConfiguration(guild: Guild): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    for (const [tier, tierConfig] of Object.entries(ROLE_TIERS)) {
      if (!tierConfig.roleId) {
        errors.push(`Role ID not configured for ${tier} tier`);
        continue;
      }

      try {
        const role = await guild.roles.fetch(tierConfig.roleId);
        if (!role) {
          errors.push(`Role not found for ${tier} tier (ID: ${tierConfig.roleId})`);
        }
      } catch {
        errors.push(`Failed to fetch role for ${tier} tier (ID: ${tierConfig.roleId})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Get member's current tier
  getMemberTier(member: GuildMember): RoleTier | null {
    const tierRoleIds = this.getTierRoleIds();

    for (const [_, role] of member.roles.cache) {
      if (tierRoleIds.includes(role.id)) {
        return this.getTierForRoleId(role.id);
      }
    }

    return null;
  }

  // Format tier display
  formatTierDisplay(tier: RoleTier | null): string {
    if (!tier) return 'None';
    return ROLE_TIERS[tier].name;
  }

  // Get next tier for a balance
  getNextTier(balance: bigint): { tier: RoleTier; tokensNeeded: bigint } | null {
    const balanceInTokens = balance / BigInt(10 ** blockchain.getDecimals());

    if (balanceInTokens < ROLE_TIERS.BRONZE.minBalance) {
      return {
        tier: 'BRONZE',
        tokensNeeded: ROLE_TIERS.BRONZE.minBalance - balanceInTokens,
      };
    } else if (balanceInTokens < ROLE_TIERS.SILVER.minBalance) {
      return {
        tier: 'SILVER',
        tokensNeeded: ROLE_TIERS.SILVER.minBalance - balanceInTokens,
      };
    } else if (balanceInTokens < ROLE_TIERS.GOLD.minBalance) {
      return {
        tier: 'GOLD',
        tokensNeeded: ROLE_TIERS.GOLD.minBalance - balanceInTokens,
      };
    }

    return null;
  }
}

// Singleton instance
export const roles = new RolesService();
export default roles;
