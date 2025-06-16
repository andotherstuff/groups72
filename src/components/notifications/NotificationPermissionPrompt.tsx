import { useState, useEffect } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://your-worker-url.workers.dev';

export function NotificationPermissionPrompt() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if we've already asked for permission or if they've dismissed
    const dismissed = localStorage.getItem(`notification-prompt-dismissed:${user.pubkey}`);
    const hasPermission = localStorage.getItem(`notification-permission:${user.pubkey}`);
    
    if (dismissed || hasPermission) return;

    // Check for user engagement - at least one of these actions
    const hasJoinedGroup = localStorage.getItem(`has-joined-group:${user.pubkey}`);
    const hasSetWallet = localStorage.getItem(`has-set-wallet:${user.pubkey}`);
    const hasCreatedGroup = localStorage.getItem(`has-created-group:${user.pubkey}`);
    
    if (hasJoinedGroup || hasSetWallet || hasCreatedGroup) {
      // Show prompt after a delay to not interrupt the user flow
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const handleEnableNotifications = async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        // Check if service worker is supported
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const registration = await navigator.serviceWorker.ready;
          
          // Subscribe to push notifications
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              import.meta.env.VITE_VAPID_PUBLIC_KEY || 'YOUR_VAPID_PUBLIC_KEY'
            )
          });
          
          // Send subscription to worker
          const response = await fetch(`${WORKER_URL}/api/notifications/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              npub: user.pubkey,
              subscription: subscription.toJSON(),
              timestamp: Date.now()
            })
          });
          
          if (response.ok) {
            localStorage.setItem(`notification-permission:${user.pubkey}`, 'granted');
            toast({
              title: "Notifications enabled",
              description: "You'll now receive notifications for group activity",
            });
            setIsVisible(false);
          } else {
            throw new Error('Failed to save subscription');
          }
        }
      } else {
        toast({
          title: "Notifications blocked",
          description: "You can enable notifications later in your browser settings",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast({
        title: "Error",
        description: "Failed to enable notifications. Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    if (user) {
      localStorage.setItem(`notification-prompt-dismissed:${user.pubkey}`, 'true');
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-2">
      <Card>
        <CardHeader className="pr-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Enable Notifications?</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Get notified when someone mentions you, reacts to your posts, or when there's activity in your groups.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            onClick={handleEnableNotifications}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? 'Enabling...' : 'Enable Notifications'}
          </Button>
          <Button
            onClick={handleDismiss}
            variant="outline"
            disabled={isLoading}
          >
            Not Now
          </Button>
        </CardContent>
      </Card>
    </div>
  );
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
