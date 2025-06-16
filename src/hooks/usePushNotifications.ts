import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserGroups } from '@/hooks/useUserGroups';
import { useToast } from '@/hooks/useToast';
import { nip19 } from 'nostr-tools';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://groups-notifications.workers.dev';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BN3XFrNV5EPXuBtW8gTOXZ8s1JzowUQZCPy2kyAiPvPq4x1zSwdZuEXpZrDYIvhW_bAOQdQoV_R7sI_9IK8Hbxg';

export interface PushNotificationSettings {
  enabled: boolean;
  mentions: boolean;
  groupActivity: boolean;
  reactions: boolean;
  moderation: boolean;
  frequency: 'immediate' | 'hourly' | 'daily';
  subscribedGroups: string[];
}

export function usePushNotifications() {
  const { user } = useCurrentUser();
  const { data: userGroupsData } = useUserGroups();
  const { toast } = useToast();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState<PushNotificationSettings>({
    enabled: false,
    mentions: true,
    groupActivity: true,
    reactions: false,
    moderation: true,
    frequency: 'immediate',
    subscribedGroups: []
  });

  // Save settings to localStorage
  const saveSettings = useCallback((settings: PushNotificationSettings) => {
    if (user) {
      localStorage.setItem(`push-settings:${user.pubkey}`, JSON.stringify(settings));
    }
  }, [user]);

  // Check if already subscribed
  const checkSubscription = useCallback(async () => {
    if (!user) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
      
      if (subscription) {
        // Verify subscription is still valid on server
        const response = await fetch(`${WORKER_URL}/api/subscription/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            npub: nip19.npubEncode(user.pubkey),
            endpoint: subscription.endpoint
          })
        });
        
        if (!response.ok) {
          setIsSubscribed(false);
        }
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  }, [user]);

  // Check if push notifications are supported
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    
    if (supported) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, [checkSubscription]);

  // Load saved settings
  useEffect(() => {
    if (!user) return;
    
    const savedSettings = localStorage.getItem(`push-settings:${user.pubkey}`);
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
    
    // Auto-subscribe to owned/moderated groups
    if (userGroupsData) {
      const autoSubscribeGroups = [
        ...(userGroupsData.owned || []),
        ...(userGroupsData.moderated || [])
      ].map(group => {
        const dTag = group.tags.find(tag => tag[0] === 'd')?.[1];
        return `34550:${group.pubkey}:${dTag}`;
      });
      
      setSettings(prev => ({
        ...prev,
        subscribedGroups: [...new Set([...prev.subscribedGroups, ...autoSubscribeGroups])]
      }));
    }
  }, [user, userGroupsData]);

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!user || !isSupported) return false;
    
    setIsLoading(true);
    
    try {
      // Request permission if needed
      if (permission !== 'granted') {
        const newPermission = await Notification.requestPermission();
        setPermission(newPermission);
        
        if (newPermission !== 'granted') {
          toast({
            title: "Permission denied",
            description: "You need to allow notifications in your browser settings",
            variant: "destructive"
          });
          setIsLoading(false);
          return false;
        }
      }
      
      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;
      
      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      
      // Send subscription to server
      const response = await fetch(`${WORKER_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npub: nip19.npubEncode(user.pubkey),
          subscription: subscription.toJSON(),
          preferences: {
            subscriptions: {
              groups: settings.subscribedGroups,
              keywords: [],
              authors: []
            },
            settings: {
              mentions: settings.mentions,
              groupActivity: settings.groupActivity,
              reactions: settings.reactions,
              moderation: settings.moderation,
              frequency: settings.frequency
            }
          }
        })
      });
      
      if (response.ok) {
        setIsSubscribed(true);
        setSettings(prev => ({ ...prev, enabled: true }));
        saveSettings({ ...settings, enabled: true });
        
        toast({
          title: "Push notifications enabled",
          description: "You'll receive notifications for group activity"
        });
        
        // Mark that user has enabled notifications
        localStorage.setItem(`notification-permission:${user.pubkey}`, 'granted');
        
        return true;
      } else {
        throw new Error('Failed to save subscription');
      }
    } catch (error) {
      console.error('Error subscribing:', error);
      toast({
        title: "Subscription failed",
        description: "Could not enable push notifications. Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported, permission, settings, toast, saveSettings]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!user || !isSupported) return false;
    
    setIsLoading(true);
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        // Unsubscribe from browser
        await subscription.unsubscribe();
        
        // Remove from server
        await fetch(`${WORKER_URL}/api/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            npub: nip19.npubEncode(user.pubkey)
          })
        });
      }
      
      setIsSubscribed(false);
      setSettings(prev => ({ ...prev, enabled: false }));
      saveSettings({ ...settings, enabled: false });
      localStorage.removeItem(`notification-permission:${user.pubkey}`);
      
      toast({
        title: "Notifications disabled",
        description: "You won't receive push notifications anymore"
      });
      
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast({
        title: "Error",
        description: "Could not disable notifications. Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isSupported, settings, toast, saveSettings]);

  // Update notification settings
  const updateSettings = useCallback(async (newSettings: Partial<PushNotificationSettings>) => {
    if (!user) return;
    
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
    
    // If subscribed, update server settings
    if (isSubscribed) {
      try {
        await fetch(`${WORKER_URL}/api/preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            npub: nip19.npubEncode(user.pubkey),
            preferences: {
              subscriptions: {
                groups: updatedSettings.subscribedGroups,
                keywords: [],
                authors: []
              },
              settings: {
                mentions: updatedSettings.mentions,
                groupActivity: updatedSettings.groupActivity,
                reactions: updatedSettings.reactions,
                moderation: updatedSettings.moderation,
                frequency: updatedSettings.frequency
              }
            }
          })
        });
      } catch (error) {
        console.error('Error updating preferences:', error);
      }
    }
  }, [user, settings, isSubscribed, saveSettings]);

  // Toggle group subscription
  const toggleGroupSubscription = useCallback((groupId: string) => {
    const newGroups = settings.subscribedGroups.includes(groupId)
      ? settings.subscribedGroups.filter(id => id !== groupId)
      : [...settings.subscribedGroups, groupId];
    
    updateSettings({ subscribedGroups: newGroups });
  }, [settings.subscribedGroups, updateSettings]);

  // Test notification
  const sendTestNotification = useCallback(async () => {
    if (!user || !isSubscribed) return;
    
    try {
      const response = await fetch(`${WORKER_URL}/api/test-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          npub: nip19.npubEncode(user.pubkey),
          message: 'This is a test notification from Chorus! 🎵'
        })
      });
      
      if (response.ok) {
        toast({
          title: "Test sent",
          description: "You should receive a notification shortly"
        });
      }
    } catch (error) {
      console.error('Error sending test:', error);
      toast({
        title: "Error",
        description: "Could not send test notification",
        variant: "destructive"
      });
    }
  }, [user, isSubscribed, toast]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    settings,
    subscribe,
    unsubscribe,
    updateSettings,
    toggleGroupSubscription,
    sendTestNotification
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}