import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Header from "@/components/ui/Header";
import { Bell, AlertTriangle, ShieldAlert, UserPlus, UserMinus } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { useNotifications, useMarkNotificationAsRead } from "@/hooks/useNotifications";
import type { Notification } from "@/hooks/useNotifications";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthor } from "@/hooks/useAuthor";
import { formatDistanceToNow } from "date-fns";
import { GroupReference } from "@/components/groups/GroupReference";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useUserGroups } from "@/hooks/useUserGroups";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NostrEvent } from '@nostrify/nostrify';

export default function Notifications() {
  const { user } = useCurrentUser();
  const { data: notifications = [], isLoading, refetch } = useNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const { data: userGroupsData } = useUserGroups();
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading: pushLoading,
    settings,
    subscribe,
    unsubscribe,
    updateSettings,
    toggleGroupSubscription,
    sendTestNotification
  } = usePushNotifications();

  // Mark all notifications as read when the page is viewed
  useEffect(() => {
    for (const notification of notifications) {
      if (!notification.read) {
        markAsRead(notification.id);
      }
    }

    // Refetch after marking as read to update the UI
    const timer = setTimeout(() => {
      refetch();
    }, 500);

    return () => clearTimeout(timer);
  }, [markAsRead, notifications, refetch]);

  const NotificationItem = ({ notification }: { notification: Notification }) => {
    const { data: authorData } = useAuthor(notification.pubkey || "");
    const authorName = authorData?.metadata?.name || notification.pubkey?.slice(0, 8) || "Unknown";
    const authorPicture = authorData?.metadata?.picture;

    let linkTo = "";
    let linkText = "View details";

    switch (notification.type) {
      case "group_update":
        if (notification.groupId) {
          linkTo = `/group/${notification.groupId}`;
          linkText = "View group";
        }
        break;
      case "post_approved":
      case "post_removed":
        if (notification.groupId) {
          if (notification.eventId) {
            linkTo = `/group/${notification.groupId}?post=${notification.eventId}`;
            linkText = "View post";
          } else {
            linkTo = `/group/${notification.groupId}`;
            linkText = "View group";
          }
        }
        break;
      case "tag_post":
      case "tag_reply":
      case "reaction":
        if (notification.eventId && notification.groupId) {
          linkTo = `/group/${notification.groupId}?post=${notification.eventId}`;
          linkText = "View post";
        } else if (notification.groupId) {
          linkTo = `/group/${notification.groupId}`;
          linkText = "View group";
        }
        break;
      case "join_request":
        if (notification.groupId) {
          linkTo = `/group/${notification.groupId}#members?membersTab=requests`;
          linkText = "View join requests";
        }
        break;
      case "leave_request":
        if (notification.groupId) {
          linkTo = `/group/${notification.groupId}#members`;
          linkText = "View members";
        }
        break;
      case "report":
      case "report_action":
        if (notification.groupId) {
          linkTo = `/group/${notification.groupId}#reports`;
          if (notification.eventId) {
            linkTo += `?reportId=${notification.eventId}`;
            linkText = "View report";
          } else {
            linkText = "View reports";
          }
        }
        break;
    }
    
    // Get the appropriate icon for the notification type
    const getNotificationIcon = () => {
      if (notification.pubkey && notification.type !== 'report' && notification.type !== 'report_action' && 
          notification.type !== 'join_request' && notification.type !== 'leave_request') {
        return (
          <Avatar className="w-10 h-10">
            <AvatarImage src={authorPicture} />
            <AvatarFallback>{authorName[0]}</AvatarFallback>
          </Avatar>
        );
      }
      
      switch (notification.type) {
        case 'report':
          return (
            <div className="w-10 h-10 flex items-center justify-center bg-red-100 dark:bg-red-900/20 rounded-full">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
          );
        case 'report_action':
          return (
            <div className="w-10 h-10 flex items-center justify-center bg-amber-100 dark:bg-amber-900/20 rounded-full">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
            </div>
          );
        case 'join_request':
          return (
            <div className="w-10 h-10 flex items-center justify-center bg-green-100 dark:bg-green-900/20 rounded-full">
              <UserPlus className="w-5 h-5 text-green-500" />
            </div>
          );
        case 'leave_request':
          return (
            <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900/20 rounded-full">
              <UserMinus className="w-5 h-5 text-blue-500" />
            </div>
          );
        default:
          return (
            <div className="w-10 h-10 flex items-center justify-center bg-primary/10 rounded-full">
              <Bell className="w-5 h-5 text-primary" />
            </div>
          );
      }
    };

    // Redirect to home if user is not logged in
    if (!user) {
      return <Navigate to="/" />;
    }

    // Get badge for notification type
    const getNotificationBadge = () => {
      switch (notification.type) {
        case 'report':
          return <Badge variant="destructive">{notification.reportType || 'Report'}</Badge>;
        case 'report_action':
          return <Badge variant="outline">{notification.actionType || 'Action'}</Badge>;
        case 'join_request':
          return <Badge variant="secondary">Join Request</Badge>;
        case 'leave_request':
          return <Badge variant="default">Leave Request</Badge>;
        default:
          return null;
      }
    };

    return (
      <Card className={`mb-4 ${notification.read ? 'opacity-70' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {getNotificationIcon()}
            <div className="flex-1">
              <div className="font-medium">
                {notification.pubkey && (notification.type === 'reaction' || notification.type === 'tag_post' || notification.type === 'tag_reply' || notification.type === 'post_approved' || notification.type === 'post_removed') ? `${authorName} ` : ''}
                {notification.message}
                {notification.pubkey && (notification.type !== 'reaction' && notification.type !== 'tag_post' && notification.type !== 'tag_reply' && notification.type !== 'post_approved' && notification.type !== 'post_removed' && notification.type !== 'report' && notification.type !== 'report_action') && ` from ${authorName}`}
                {notification.groupId && <GroupReference groupId={notification.groupId} />}
                {getNotificationBadge() && (
                  <span className="ml-2 inline-block">{getNotificationBadge()}</span>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDistanceToNow(notification.createdAt * 1000, { addSuffix: true })}
              </div>
              {linkTo && notification.groupId && (
                <Button variant="link" className="p-0 h-auto mt-1" asChild>
                  <Link to={linkTo}>{linkText}</Link>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Group list item component
  const GroupListItem = ({ group }: { group: NostrEvent }) => {
    const dTag = group.tags.find((tag: string[]) => tag[0] === 'd')?.[1];
    const nameTag = group.tags.find((tag: string[]) => tag[0] === 'name')?.[1];
    const pictureTag = group.tags.find((tag: string[]) => tag[0] === 'picture')?.[1];
    const groupId = `34550:${group.pubkey}:${dTag}`;
    const isSubscribed = settings.subscribedGroups.includes(groupId);

    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={pictureTag} />
            <AvatarFallback>{nameTag?.[0] || 'G'}</AvatarFallback>
          </Avatar>
          <span>{nameTag || dTag}</span>
        </div>
        <Switch
          checked={isSubscribed}
          onCheckedChange={() => toggleGroupSubscription(groupId)}
        />
      </div>
    );
  };

  return (
    <div className="container mx-auto py-1 px-3 sm:px-4">
      <Header />
      <div className="space-y-6 my-6">
        <Tabs defaultValue="recent" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recent">Recent Notifications</TabsTrigger>
            <TabsTrigger value="settings">Push Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="recent" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Your Notifications</CardTitle>
                <CardDescription>
                  Stay updated on activity related to your account and groups
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">Loading notifications...</div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    You don't have any notifications yet
                  </div>
                ) : (
                  <div>
                    {notifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Push Notifications</CardTitle>
                <CardDescription>
                  Get real-time notifications for group activity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!isSupported ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Push notifications are not supported in your browser
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="push-enabled" className="text-base">
                          Enable Push Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive notifications even when the app is closed
                        </p>
                      </div>
                      <Switch
                        id="push-enabled"
                        checked={isSubscribed}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            subscribe();
                          } else {
                            unsubscribe();
                          }
                        }}
                        disabled={pushLoading}
                      />
                    </div>

                    {isSubscribed && (
                      <>
                        <Separator />
                        
                        <div className="space-y-4">
                          <h3 className="font-medium">Notification Types</h3>
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="mentions" className="font-normal">
                                Mentions
                              </Label>
                              <Switch
                                id="mentions"
                                checked={settings.mentions}
                                onCheckedChange={(checked) => updateSettings({ mentions: checked })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Label htmlFor="group-activity" className="font-normal">
                                Group Activity
                              </Label>
                              <Switch
                                id="group-activity"
                                checked={settings.groupActivity}
                                onCheckedChange={(checked) => updateSettings({ groupActivity: checked })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Label htmlFor="reactions" className="font-normal">
                                Reactions
                              </Label>
                              <Switch
                                id="reactions"
                                checked={settings.reactions}
                                onCheckedChange={(checked) => updateSettings({ reactions: checked })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Label htmlFor="moderation" className="font-normal">
                                Moderation Actions
                              </Label>
                              <Switch
                                id="moderation"
                                checked={settings.moderation}
                                onCheckedChange={(checked) => updateSettings({ moderation: checked })}
                              />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium">Subscribed Groups</h3>
                            <Badge variant="secondary">
                              {settings.subscribedGroups.length} groups
                            </Badge>
                          </div>
                          
                          <ScrollArea className="h-[300px] border rounded-md p-4">
                            {userGroupsData?.member?.map((group) => (
                              <GroupListItem key={group.id} group={group} />
                            ))}
                            {userGroupsData?.owned?.map((group) => (
                              <GroupListItem key={group.id} group={group} />
                            ))}
                            {userGroupsData?.moderated?.map((group) => (
                              <GroupListItem key={group.id} group={group} />
                            ))}
                          </ScrollArea>
                        </div>

                        <Separator />

                        <Button
                          onClick={sendTestNotification}
                          variant="outline"
                          className="w-full"
                        >
                          Send Test Notification
                        </Button>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}