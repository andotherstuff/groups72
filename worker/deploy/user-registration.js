/**
 * User Registration Management for Enhanced Notification Worker
 * Handles user subscriptions, preferences, and group memberships
 */

// Add to the NotificationWorker class
class NotificationWorker {
  // ... existing methods ...

  /**
   * Register a new user for push notifications
   */
  async registerUser(userData) {
    const { npub, pubkey, subscription, preferences } = userData;
    
    if (!pubkey || !subscription) {
      throw new Error('Missing required fields: pubkey and subscription');
    }

    // Get existing users
    const users = await this.getAllUsers();
    
    // Remove existing registration for this pubkey
    const filteredUsers = users.filter(u => u.pubkey !== pubkey);
    
    // Get user's groups from Nostr
    const userGroups = await this.nostr.getUserGroups(pubkey);
    
    // Create new user profile
    const newUser = new UserProfile({
      npub,
      pubkey,
      subscription,
      preferences: preferences || {},
      groups: userGroups.memberOf,
      adminGroups: userGroups.owned,
      moderatedGroups: userGroups.moderated,
      lastSeen: Date.now(),
      isOnline: true
    });

    filteredUsers.push(newUser);

    // Save back to KV
    await this.kv.put('users:all', JSON.stringify(filteredUsers));
    
    console.log(`User registered: ${pubkey.slice(0, 8)}`);
    return { success: true, userId: pubkey };
  }

  /**
   * Unregister a user
   */
  async unregisterUser(pubkey) {
    const users = await this.getAllUsers();
    const filteredUsers = users.filter(u => u.pubkey !== pubkey);
    
    await this.kv.put('users:all', JSON.stringify(filteredUsers));
    
    console.log(`User unregistered: ${pubkey.slice(0, 8)}`);
    return { success: true };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(pubkey, preferences) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.pubkey === pubkey);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    users[userIndex].preferences = { ...users[userIndex].preferences, ...preferences };
    users[userIndex].updatedAt = Date.now();

    await this.kv.put('users:all', JSON.stringify(users));
    
    return { success: true };
  }

  /**
   * Update user's last seen timestamp
   */
  async updateUserActivity(pubkey, isOnline = true) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.pubkey === pubkey);
    
    if (userIndex === -1) return;

    users[userIndex].lastSeen = Date.now();
    users[userIndex].isOnline = isOnline;
    users[userIndex].updatedAt = Date.now();

    await this.kv.put('users:all', JSON.stringify(users));
  }

  /**
   * Refresh user's group memberships
   */
  async refreshUserGroups(pubkey) {
    const users = await this.getAllUsers();
    const userIndex = users.findIndex(u => u.pubkey === pubkey);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const userGroups = await this.nostr.getUserGroups(pubkey);
    
    users[userIndex].groups = userGroups.memberOf;
    users[userIndex].adminGroups = userGroups.owned;
    users[userIndex].moderatedGroups = userGroups.moderated;
    users[userIndex].updatedAt = Date.now();

    await this.kv.put('users:all', JSON.stringify(users));
    
    return { 
      success: true, 
      groups: userGroups 
    };
  }

  /**
   * Get user by pubkey
   */
  async getUser(pubkey) {
    const users = await this.getAllUsers();
    return users.find(u => u.pubkey === pubkey);
  }

  /**
   * Get users by group membership
   */
  async getUsersByGroup(groupId) {
    const users = await this.getAllUsers();
    return users.filter(u => u.isMemberOf(groupId));
  }

  /**
   * Get moderators/admins of a group
   */
  async getGroupModerators(groupId) {
    const users = await this.getAllUsers();
    return users.filter(u => u.isModeratorOf(groupId));
  }

  /**
   * Cleanup inactive users (no activity for 30 days)
   */
  async cleanupInactiveUsers() {
    const users = await this.getAllUsers();
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const activeUsers = users.filter(u => u.lastSeen > thirtyDaysAgo);
    
    if (activeUsers.length !== users.length) {
      await this.kv.put('users:all', JSON.stringify(activeUsers));
      console.log(`Cleaned up ${users.length - activeUsers.length} inactive users`);
    }

    return {
      removed: users.length - activeUsers.length,
      remaining: activeUsers.length
    };
  }
}

// Enhanced endpoints
export const enhancedEndpoints = {
  '/register': {
    method: 'POST',
    handler: async (request, worker) => {
      const data = await request.json();
      return await worker.registerUser(data);
    }
  },

  '/unregister': {
    method: 'POST', 
    handler: async (request, worker) => {
      const { pubkey } = await request.json();
      return await worker.unregisterUser(pubkey);
    }
  },

  '/preferences': {
    method: 'PUT',
    handler: async (request, worker) => {
      const { pubkey, preferences } = await request.json();
      return await worker.updateUserPreferences(pubkey, preferences);
    }
  },

  '/activity': {
    method: 'POST',
    handler: async (request, worker) => {
      const { pubkey, isOnline } = await request.json();
      await worker.updateUserActivity(pubkey, isOnline);
      return { success: true };
    }
  },

  '/groups/refresh': {
    method: 'POST',
    handler: async (request, worker) => {
      const { pubkey } = await request.json();
      return await worker.refreshUserGroups(pubkey);
    }
  },

  '/admin/users': {
    method: 'GET',
    handler: async (request, worker) => {
      // Admin endpoint to list all users (would need authentication)
      const users = await worker.getAllUsers();
      return {
        total: users.length,
        users: users.map(u => ({
          pubkey: u.pubkey,
          lastSeen: u.lastSeen,
          isOnline: u.isOnline,
          groupCount: u.groups.length,
          adminGroupCount: u.adminGroups.length,
          createdAt: u.createdAt
        }))
      };
    }
  },

  '/admin/cleanup': {
    method: 'POST',
    handler: async (request, worker) => {
      return await worker.cleanupInactiveUsers();
    }
  }
};
