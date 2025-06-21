import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { useNostr } from "@/hooks/useNostr";
import { usePendingReplies } from "@/hooks/usePendingReplies";
import { usePendingPostsCount } from "@/hooks/usePendingPostsCount";
import { useOpenReportsCount } from "@/hooks/useOpenReportsCount";
import { usePendingJoinRequests } from "@/hooks/usePendingJoinRequests";
import { useApprovedMembers } from "@/hooks/useApprovedMembers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RichText } from "@/components/ui/RichText";
import { KINDS } from "@/lib/nostr-kinds";

import { CreatePostForm } from "@/components/groups/CreatePostForm";
import { PostList } from "@/components/groups/PostList";
import { JoinRequestButton } from "@/components/groups/JoinRequestButton";
import { SimpleMembersList } from "@/components/groups/SimpleMembersList";
import { GroupNutzapButton } from "@/components/groups/GroupNutzapButton";
import { GroupNutzapTotal } from "@/components/groups/GroupNutzapTotal";
import { GroupNutzapList } from "@/components/groups/GroupNutzapList";
import { Users, Settings, MessageSquare, CheckCircle, DollarSign, QrCode, FileText, Shield, UserPlus, Save, Trash2, FileWarning } from "lucide-react";
import { parseNostrAddress } from "@/lib/nostr-utils";
import Header from "@/components/ui/Header";
import { MemberManagement } from "@/components/groups/MemberManagement";
import { ReportsList } from "@/components/groups/ReportsList";
import { useAuthor } from "@/hooks/useAuthor";
import { toast } from "sonner";
import { NostrEvent } from "@nostrify/nostrify";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { QRCodeModal } from "@/components/QRCodeModal";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGroup } from "@/hooks/useGroup";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { useIsGroupDeleted } from "@/hooks/useGroupDeletionRequests";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const [parsedId, setParsedId] = useState<{ kind: number; pubkey: string; identifier: string } | null>(null);
  const [showOnlyApproved, setShowOnlyApproved] = useState(true);
  const [currentPostCount, setCurrentPostCount] = useState(0);
  const [activeTab, setActiveTab] = useState("posts");
  const [imageLoading, setImageLoading] = useState(true);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);

  // Form state for management tab
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formGuidelines, setFormGuidelines] = useState("");
  const [formModerators, setFormModerators] = useState<string[]>([]);

  const searchParams = new URLSearchParams(location.search);
  const reportId = searchParams.get('reportId');
  const hash = location.hash.replace('#', '');

  useEffect(() => {
    if (groupId) {
      const parsed = parseNostrAddress(decodeURIComponent(groupId));
      if (parsed) {
        setParsedId(parsed);
      }
    }
  }, [groupId]);

  const { data: community, isLoading: isLoadingCommunity } = useGroup(groupId);

  // Check if group has been deleted
  const { isDeleted: isGroupDeleted, deletionRequest } = useIsGroupDeleted(
    parsedId ? `${KINDS.GROUP}:${parsedId.pubkey}:${parsedId.identifier}` : undefined
  );

  // Get approved members using the centralized hook
  const { approvedMembers } = useApprovedMembers(groupId || '');

  const isOwner = user && community && user.pubkey === community.pubkey;

  // Get moderators from community event
  const moderators = community?.tags
    .filter(tag => tag[0] === "p" && tag[3] === "moderator")
    .map(tag => tag[1]) || [];

  const isModerator = isOwner || (user && moderators.includes(user.pubkey));

  // Initialize form state from community data
  useEffect(() => {
    if (community) {
      const communityEvent = community as NostrEvent;
      const nameTag = communityEvent.tags.find(tag => tag[0] === "name");
      const descriptionTag = communityEvent.tags.find(tag => tag[0] === "description");
      const imageTag = communityEvent.tags.find(tag => tag[0] === "image");
      const guidelinesTag = communityEvent.tags.find(tag => tag[0] === "guidelines");

      const modTags = communityEvent.tags.filter(tag =>
        tag[0] === "p" && (
          (tag.length > 3 && tag[3] === "moderator") ||
          (communityEvent.kind === KINDS.GROUP)
        )
      );

      setFormName(nameTag ? nameTag[1] : "");
      setFormDescription(descriptionTag ? descriptionTag[1] : "");
      setFormImageUrl(imageTag ? imageTag[1] : "");
      setFormGuidelines(guidelinesTag ? guidelinesTag[1] : "");

      const modPubkeys = modTags.map(tag => tag[1]);

      if (!modPubkeys.includes(communityEvent.pubkey)) {
        modPubkeys.push(communityEvent.pubkey);
      }

      const uniqueModPubkeys = [...new Set(modPubkeys)];

      setFormModerators(uniqueModPubkeys);
    }
  }, [community]);

  // Handler to ensure unapproved posts are visible when user posts
  const handlePostSuccess = () => {
    // If the user is not an approved member or moderator, show all posts
    if (user && !isModerator && approvedMembers && !approvedMembers.includes(user.pubkey)) {
      setShowOnlyApproved(false);
    }
  };

  const { data: pendingPostsCount = 0 } = usePendingPostsCount(groupId || '');
  const { data: pendingReplies = [] } = usePendingReplies(groupId || '');
  const { data: openReportsCount = 0 } = useOpenReportsCount(groupId || '');
  const { pendingRequestsCount = 0 } = usePendingJoinRequests(groupId || '');
  const totalPendingCount = (pendingPostsCount || 0) + pendingReplies.length;

  // Handler functions for management
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("You must be logged in to update group settings");
      return;
    }

    if (!isOwner) {
      toast.error("Only the group owner can update general settings");
      return;
    }

    if (!parsedId) {
      toast.error("Invalid group ID");
      return;
    }

    const communityEvent = community as NostrEvent;

    try {
      // Create a new tags array with only unique tag types
      const tags: string[][] = [];

      // Always include identifier
      tags.push(["d", parsedId.identifier]);

      // Add form values
      tags.push(["name", formName]);
      tags.push(["description", formDescription]);

      // Only add guidelines if there's content
      if (formGuidelines) {
        tags.push(["guidelines", formGuidelines]);
      }

      // Handle image separately to preserve dimensions if they exist
      if (formImageUrl) {
        const originalImageTag = communityEvent.tags.find(tag => tag[0] === "image");
        if (originalImageTag && originalImageTag.length > 2) {
          tags.push(["image", formImageUrl, originalImageTag[2]]);
        } else {
          tags.push(["image", formImageUrl]);
        }
      }

      // Preserve other tag types (except for name, description, guidelines, d, image, and p)
      const preservedTagTypes = ["name", "description", "guidelines", "d", "image", "p"];
      for (const tag of communityEvent?.tags || []) {
        if (!preservedTagTypes.includes(tag[0])) {
          tags.push([...tag]);
        }
      }

      // Add moderators
      const allModerators = [...new Set([...formModerators, communityEvent.pubkey])];

      for (const mod of allModerators) {
        const originalModTag = communityEvent.tags.find(tag =>
          tag[0] === "p" && tag[1] === mod
        );

        if (originalModTag && originalModTag.length > 2 && originalModTag[2]) {
          tags.push(["p", mod, originalModTag[2], "moderator"]);
        } else {
          tags.push(["p", mod, "", "moderator"]);
        }
      }

      await publishEvent({
        kind: KINDS.GROUP,
        tags,
        content: "",
      });

      // Invalidate relevant queries to update the UI
      queryClient.invalidateQueries({ queryKey: ["community-settings", parsedId?.pubkey, parsedId?.identifier] });
      queryClient.invalidateQueries({ queryKey: ["community", parsedId?.pubkey, parsedId?.identifier] });
      queryClient.invalidateQueries({ queryKey: ["user-groups", user?.pubkey] });

      toast.success("Group settings updated successfully!");
    } catch (error) {
      console.error("Error updating community settings:", error);
      toast.error("Failed to update group settings. Please try again.");
    }
  };

  const handleAddModerator = async (pubkey: string) => {
    if (!isOwner) {
      toast.error("Only the group owner can add moderators");
      return;
    }

    if (!formModerators.includes(pubkey)) {
      try {
        const updatedModerators = [...formModerators, pubkey];
        const communityEvent = community as NostrEvent;

        // Create a new tags array with only unique tag types
        const tags: string[][] = [];

        // Always include identifier
        if (parsedId) {
          tags.push(["d", parsedId.identifier]);
        }

        // Preserve existing tags except for p and d tags
        const tagTypesToExclude = ["p", "d"];
        for (const tag of communityEvent?.tags || []) {
          if (!tagTypesToExclude.includes(tag[0])) {
            // Only add this tag if we haven't already added a tag of this type
            if (!tags.some(existingTag => existingTag[0] === tag[0])) {
              tags.push([...tag]);
            }
          }
        }

        // Add all moderators including the new one
        const uniqueModPubkeys = [...new Set(updatedModerators)];
        for (const mod of uniqueModPubkeys) {
          const originalModTag = communityEvent?.tags.find(tag =>
            tag[0] === "p" && tag[1] === mod
          );
          if (originalModTag && originalModTag.length > 2 && originalModTag[2]) {
            tags.push(["p", mod, originalModTag[2], "moderator"]);
          } else {
            tags.push(["p", mod, "", "moderator"]);
          }
        }

        await publishEvent({
          kind: KINDS.GROUP,
          tags,
          content: "",
        });

        setFormModerators(uniqueModPubkeys);

        // Invalidate relevant queries to update the UI
        queryClient.invalidateQueries({ queryKey: ["community-settings", parsedId?.pubkey, parsedId?.identifier] });
        queryClient.invalidateQueries({ queryKey: ["community", parsedId?.pubkey, parsedId?.identifier] });
        queryClient.invalidateQueries({ queryKey: ["user-groups", user?.pubkey] });

        toast.success("Moderator added successfully!");
      } catch (error) {
        console.error("Error adding moderator:", error);
        toast.error("Failed to add moderator. Please try again.");
      }
    } else {
      toast.info("This user is already a moderator.");
    }
  };

  const handleRemoveModerator = async (pubkey: string) => {
    if (!isOwner) {
      toast.error("Only the group owner can remove moderators");
      return;
    }
    const communityEvent = community as NostrEvent;
    if (community && communityEvent.pubkey === pubkey) {
      toast.error("Cannot remove the group owner");
      return;
    }
    try {
      // Create a new tags array with only unique tag types
      const tags: string[][] = [];

      // Always include identifier
      if (parsedId) {
        tags.push(["d", parsedId.identifier]);
      }

      // Track which tag types we've already added
      const addedTagTypes = new Set(["d"]);

      // Add all tags except the moderator to be removed
      for (const tag of communityEvent.tags) {
        // Skip the moderator we're removing
        if (tag[0] === "p" && tag[1] === pubkey) {
          continue;
        }

        // Skip duplicate tag types
        if (addedTagTypes.has(tag[0])) {
          continue;
        }

        // Add the tag and mark type as added
        tags.push([...tag]);
        addedTagTypes.add(tag[0]);
      }

      await publishEvent({
        kind: KINDS.GROUP,
        tags,
        content: "",
      });
      setFormModerators(formModerators.filter(mod => mod !== pubkey));

      // Invalidate relevant queries to update the UI
      queryClient.invalidateQueries({ queryKey: ["community-settings", parsedId?.pubkey, parsedId?.identifier] });
      queryClient.invalidateQueries({ queryKey: ["community", parsedId?.pubkey, parsedId?.identifier] });
      queryClient.invalidateQueries({ queryKey: ["user-groups", user?.pubkey] });

      toast.success("Moderator removed successfully!");
    } catch (error) {
      console.error("Error removing moderator:", error);
      toast.error("Failed to remove moderator. Please try again.");
    }
  };

  const handleDeleteGroup = async () => {
    if (!isOwner) {
      toast.error("Only the group owner can delete the group");
      return;
    }

    if (!community || !parsedId) {
      toast.error("Group information not available");
      return;
    }

    try {
      // Create a kind 5 deletion event referencing the group
      // Include both 'a' tag (addressable event) and 'e' tag (event ID) for maximum relay compatibility
      await publishEvent({
        kind: KINDS.DELETION,
        tags: [
          ["a", `${KINDS.GROUP}:${community.pubkey}:${parsedId.identifier}`],
          ["e", community.id],
          ["k", KINDS.GROUP.toString()]
        ],
        content: "Requesting deletion of this group",
      });

      toast.success("Group deletion requested successfully!");
      
      // Navigate back to groups page after successful deletion request
      navigate("/groups");
    } catch (error) {
      console.error("Error requesting group deletion:", error);
      toast.error("Failed to request group deletion. Please try again.");
    }
  };

  // Set active tab based on URL hash, handle post anchoring
  useEffect(() => {
    // Define valid tab values
    const validTabs = ["posts", "members", "ecash", "manage"];

    if (hash && validTabs.includes(hash)) {
      setActiveTab(hash);
    }
    // If the hash references a post ID (not a tab name), scroll to it
    else if (hash) {
      // Set active tab to posts to show the post content
      if (activeTab !== "posts") {
        setActiveTab("posts");
      }
      
      // Wait for content to render before attempting to scroll
      setTimeout(() => {
        const postElement = document.getElementById(hash);
        if (postElement) {
          postElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Optional: add a highlight effect on the post
          postElement.classList.add('bg-amber-50', 'dark:bg-amber-900/20');
          setTimeout(() => {
            postElement.classList.remove('bg-amber-50', 'dark:bg-amber-900/20');
          }, 2000);
        }
      }, 500);
    }
    // Only set these fallbacks on initial mount to avoid constantly resetting
    else if (!activeTab || !validTabs.includes(activeTab)) {
      setActiveTab("posts");
    }

    // Deliberately not including activeTab in the dependencies to prevent loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);

  // Handle initial load for special cases (reports, pending items) without affecting normal tab operation
  useEffect(() => {
    // Only run once on mount and if hash is not already set
    if (!hash) {
      // For backward compatibility, try to handle old parameters
      if (reportId && isModerator) {
        setActiveTab("posts");
      }
      else if (isModerator && totalPendingCount > 0) {
        setActiveTab("posts");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nameTag = community?.tags.find(tag => tag[0] === "name");
  const descriptionTag = community?.tags.find(tag => tag[0] === "description");
  const imageTag = community?.tags.find(tag => tag[0] === "image");
  const guidelinesTag = community?.tags.find(tag => tag[0] === "guidelines");

  const name = nameTag ? nameTag[1] : (parsedId?.identifier || "Unnamed Group");
  const description = descriptionTag ? descriptionTag[1] : "No description available";
  const image = imageTag ? imageTag[1] : undefined;
  const hasGuidelines = guidelinesTag && guidelinesTag[1].trim().length > 0;

  useEffect(() => {
    if (name && name !== "Unnamed Group") {
      document.title = `+chorus - ${name}`;
    } else {
      document.title = "+chorus";
    }
    return () => {
      document.title = "+chorus";
    };
  }, [name]);

  // Reset image loading state when image URL changes
  useEffect(() => {
    setImageLoading(true);
  }, [image]);

  if (isLoadingCommunity || !parsedId) {
    return (
      <div className="container mx-auto py-1 px-3 sm:px-4">
        <Header />
        <h1 className="text-2xl font-bold mb-4">Loading group...</h1>

        <div className="relative mb-6 mt-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Skeleton className="h-40 w-full rounded-lg mb-2" />
            </div>
            <div className="min-w-[140px] flex flex-col justify-start">
              <Skeleton className="h-8 w-full rounded-md mb-2" />
              <Skeleton className="h-8 w-full rounded-md mb-2" />
            </div>
          </div>

          <div className="w-full mt-4">
            <Skeleton className="h-8 w-3/4 rounded-md mb-2" />
            <Skeleton className="h-4 w-full rounded-md mb-1" />
            <Skeleton className="h-4 w-5/6 rounded-md mb-1" />
            <Skeleton className="h-4 w-2/3 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="container mx-auto py-1 px-3 sm:px-4">
        <Header />
        <h1 className="text-2xl font-bold mb-4">Group not found</h1>
        <p>The group you're looking for doesn't exist or has been deleted.</p>
        <Button asChild className="mt-2">
          <Link to="/groups">Back to Groups</Link>
        </Button>
      </div>
    );
  }

  // Show deletion notice if group has been deleted
  if (isGroupDeleted && deletionRequest) {
    return (
      <div className="container mx-auto py-1 px-3 sm:px-4">
        <Header />
        
        <div className="max-w-3xl mx-auto mt-8">
          <Alert className="border-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <div className="font-semibold">This group has been deleted</div>
              <p>
                The group owner has requested deletion of this group on{" "}
                {new Date(deletionRequest.deletionEvent.created_at * 1000).toLocaleDateString()}.
              </p>
              {deletionRequest.reason && (
                <p className="text-sm text-muted-foreground">
                  <strong>Reason:</strong> {deletionRequest.reason}
                </p>
              )}
              <div className="pt-2">
                <Button asChild>
                  <Link to="/groups">Browse Other Groups</Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-1 px-3 sm:px-4">
      <Header />

      <div className="relative mb-6 mt-4 max-w-3xl mx-auto">
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="h-40 rounded-lg overflow-hidden mb-2 relative">
              {imageLoading && (
                <Skeleton className="absolute inset-0 w-full h-full z-10" />
              )}
              {/* Check if the image URL is likely a video */}
              {image && image.match(/\.(mp4|webm|ogg|mov)$/i) ? (
                <video
                  src={image}
                  className="w-full h-full object-cover object-center"
                  autoPlay
                  muted
                  loop
                  playsInline
                  onLoadedData={() => setImageLoading(false)}
                  onError={(e) => {
                    setImageLoading(false);
                    // Fall back to placeholder if video fails
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = '<img src="/placeholder-community.svg" class="w-full h-full object-cover object-center" />';
                    }
                  }}
                />
              ) : (
                <img
                  src={image}
                  alt={name}
                  className="w-full h-full object-cover object-center"
                  onLoad={() => setImageLoading(false)}
                  onError={(e) => {
                    setImageLoading(false);
                    e.currentTarget.src = "/placeholder-community.svg";
                  }}
                />
              )}
            </div>
          </div>

          <div className="flex flex-col min-w-[140px] h-40 justify-start">
            <JoinRequestButton communityId={groupId || ''} isModerator={isModerator || false} className="mb-2 h-8" />

            {user && community && (
              <GroupNutzapButton
                groupId={`${KINDS.GROUP}:${parsedId?.pubkey}:${parsedId?.identifier}`}
                ownerPubkey={community.pubkey}
                variant="outline"
                className="w-full mb-2 h-8"
              />
            )}
          </div>
        </div>

        <div className="w-full mt-4">
          <div className="flex items-center mb-2">
            <h1 className="text-2xl font-bold">{name}</h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 ml-2"
                    onClick={() => setShowQRCode(true)}
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Share group QR code
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {hasGuidelines && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 ml-1"
                      onClick={() => setShowGuidelines(true)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Community guidelines
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center mb-3">
            <span className="text-sm text-muted-foreground mr-2 whitespace-nowrap">Sent to the group</span>
            <GroupNutzapTotal
              groupId={`${KINDS.GROUP}:${parsedId?.pubkey}:${parsedId?.identifier}`}
              className="w-auto max-w-[180px]"
            />
          </div>
          <RichText className="text-xs text-muted-foreground">{description}</RichText>
        </div>
      </div>

      <Tabs value={activeTab} defaultValue="posts" onValueChange={(value) => {
        setActiveTab(value);
        // Update URL hash without full page reload
        window.history.pushState(null, '', `#${value}`);
      }} className="w-full">
        <div className="flex justify-center">
          <TabsList className={`mb-4 w-full md:w-auto grid ${isModerator ? 'grid-cols-4' : 'grid-cols-3'} gap-0`}>
            <TabsTrigger value="posts" className="flex items-center justify-center">
              <MessageSquare className="h-4 w-4 mr-1" />
              Posts
            </TabsTrigger>

            <TabsTrigger value="members" className="flex items-center justify-center">
              <Users className="h-4 w-4 mr-1" />
              Members
            </TabsTrigger>

            <TabsTrigger value="ecash" className="flex items-center justify-center">
              <DollarSign className="h-4 w-4 mr-1" />
              Send eCash
            </TabsTrigger>

            {isModerator && (
              <TabsTrigger value="manage" className="flex items-center justify-center relative">
                <Settings className="h-4 w-4 mr-1" />
                Manage
                {(openReportsCount > 0 || pendingRequestsCount > 0) && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs z-10"
                  >
                    {(openReportsCount + pendingRequestsCount) > 99 ? '99+' : (openReportsCount + pendingRequestsCount)}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="posts" className="space-y-4">
          {user && (
            <div className="max-w-3xl mx-auto">
              <CreatePostForm communityId={groupId || ''} onPostSuccess={handlePostSuccess} />
            </div>
          )}

          <div className="flex items-center justify-end mb-4 gap-2 max-w-3xl mx-auto">
            <div className="flex items-center space-x-2">
              <Switch
                id="approved-only"
                checked={showOnlyApproved}
                onCheckedChange={setShowOnlyApproved}
              />
              <Label htmlFor="approved-only" className="flex items-center cursor-pointer text-sm">
                <CheckCircle className="h-3.5 w-3.5 mr-1 text-green-500" />
                Show only approved posts
              </Label>
            </div>
          </div>

          <div className="max-w-3xl mx-auto">
            <PostList
              communityId={groupId || ''}
              showOnlyApproved={showOnlyApproved}
              onPostCountChange={setCurrentPostCount}
            />
          </div>
        </TabsContent>

        <TabsContent value="ecash" className="space-y-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Group eCash</h2>
              {user && community && (
                <div className="flex-shrink-0">
                  <GroupNutzapButton
                    groupId={`${KINDS.GROUP}:${parsedId?.pubkey}:${parsedId?.identifier}`}
                    ownerPubkey={community.pubkey}
                    className="w-auto"
                  />
                </div>
              )}
            </div>
            <GroupNutzapList groupId={`${KINDS.GROUP}:${parsedId?.pubkey}:${parsedId?.identifier}`} />
          </div>
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          <div className="max-w-3xl mx-auto">
            <SimpleMembersList communityId={groupId || ''} />
          </div>
        </TabsContent>

        {isModerator && (
          <TabsContent value="manage" className="space-y-4">
            <div className="max-w-3xl mx-auto">
              <Tabs defaultValue={isOwner ? "general" : "member-management"} className="w-full space-y-6">
                <TabsList className="grid grid-cols-3 mb-4">
                  <TabsTrigger value="general" className="flex items-center gap-2" disabled={!isOwner}>
                    <Shield className="h-4 w-4" />
                    General {!isOwner && <span className="text-xs">(Owner Only)</span>}
                  </TabsTrigger>
                  <TabsTrigger value="member-management" className="flex items-center gap-2 relative">
                    <Users className="h-4 w-4" />
                    Members
                    {pendingRequestsCount > 0 && (
                      <Badge
                        className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs bg-blue-500 hover:bg-blue-600 z-10"
                      >
                        {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="reports" className="flex items-center gap-2 relative">
                    <FileWarning className="h-4 w-4" />
                    Reports
                    {openReportsCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs z-10"
                      >
                        {openReportsCount > 99 ? '99+' : openReportsCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-6 mt-3">
                  {!isOwner ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>General Settings</CardTitle>
                        <CardDescription>
                          Only the group owner can modify general settings
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          <p>You don't have permission to modify general settings.</p>
                          <p className="text-sm mt-2">Only the group owner can update the group's basic information, as these changes require updating the community definition event.</p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <form onSubmit={handleSubmit} className="w-full space-y-8">
                      <Card>
                        <CardHeader>
                          <CardTitle>General Settings</CardTitle>
                          <CardDescription>
                            Update your group's basic information
                          </CardDescription>
                        </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Group Name</Label>
                          <Input
                            id="name"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="Enter group name"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="image">Image URL</Label>
                          <Input
                            id="image"
                            value={formImageUrl}
                            onChange={(e) => setFormImageUrl(e.target.value)}
                            placeholder="Enter image URL"
                          />

                          {formImageUrl && (
                            <div className="mt-2 rounded-md overflow-hidden border w-full">
                              <img
                                src={formImageUrl}
                                alt="Group preview"
                                className="w-full h-auto"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            placeholder="Enter group description"
                            rows={4}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="guidelines">Community Guidelines (Optional)</Label>
                          <Textarea
                            id="guidelines"
                            value={formGuidelines}
                            onChange={(e) => setFormGuidelines(e.target.value)}
                            placeholder="Enter community guidelines"
                            rows={4}
                          />
                        </div>

                        <div className="mt-3 flex justify-between">
                          {isOwner && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" type="button">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Group
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Group</AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-2">
                                    <p>
                                      Are you sure you want to request deletion of this group? This action will:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 text-sm">
                                      <li>Submit a deletion request to the network</li>
                                      <li>Signal to relays that this group should be removed</li>
                                      <li>Make the group inaccessible to new users</li>
                                    </ul>
                                    <p className="text-sm font-medium text-destructive">
                                      Note: This is a request for deletion. Individual relays may choose whether to honor this request. This does not delete individual posts within the group.
                                    </p>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={handleDeleteGroup}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete Group
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <Button type="submit">
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Moderators section - only shown to owners */}
                    {isOwner && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <Shield className="h-5 w-5 mr-2" />
                              Group Owner & Moderators
                            </CardTitle>
                            <CardDescription>
                              As the group owner, you can manage who can moderate this group
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-4">
                              {/* Always display the owner first */}
                              {community && (
                                <ModeratorItem
                                  key={(community as NostrEvent).pubkey}
                                  pubkey={(community as NostrEvent).pubkey}
                                  isCreator={true}
                                  onRemove={() => {}} // Owner can't be removed
                                />
                              )}

                              {/* Then display all moderators who are not the owner */}
                              {formModerators
                                .filter(pubkey => pubkey !== (community as NostrEvent)?.pubkey) // Filter out the owner
                                .map((pubkey) => (
                                  <ModeratorItem
                                    key={pubkey}
                                    pubkey={pubkey}
                                    isCreator={false}
                                    onRemove={() => handleRemoveModerator(pubkey)}
                                  />
                                ))
                              }

                              {formModerators.length === 0 && !community && (
                                <p className="text-muted-foreground">No moderators yet</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <Users className="h-5 w-5 mr-2" />
                              Group Members
                            </CardTitle>
                            <CardDescription>
                              As the group owner, you can promote members to moderators
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {approvedMembers.length === 0 ? (
                              <div className="text-center py-8 text-muted-foreground">
                                <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                <p>No approved members yet</p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {approvedMembers
                                  .filter(pubkey => !formModerators.includes(pubkey)) // Only show non-moderators
                                  .map((pubkey) => (
                                    <MemberItem
                                      key={pubkey}
                                      pubkey={pubkey}
                                      onPromote={() => handleAddModerator(pubkey)}
                                      isOwner={isOwner}
                                    />
                                  ))
                                }
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                    </form>
                  )}
                </TabsContent>

                <TabsContent value="member-management" className="mt-3">
                  <MemberManagement communityId={groupId || ""} isModerator={isModerator || false} />
                </TabsContent>

                <TabsContent value="reports" className="mt-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <FileWarning className="h-5 w-5 mr-2" />
                        Reports
                      </CardTitle>
                      <CardDescription>
                        Review and manage reported content in your group
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ReportsList communityId={groupId || ""} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRCode}
        onClose={() => setShowQRCode(false)}
        profileUrl={`${window.location.origin}/group/${encodeURIComponent(groupId || '')}`}
        displayName={name}
        title="Share Group"
        description={`Scan this QR code to view ${name}'s group`}
        downloadPrefix="group"
      />

      {/* Community Guidelines Modal */}
      <Dialog open={showGuidelines} onOpenChange={setShowGuidelines}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Community Guidelines</DialogTitle>
            <DialogDescription>
              Guidelines for {name}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="mt-4 max-h-[60vh] pr-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <RichText>{guidelinesTag?.[1] || "No guidelines available."}</RichText>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ModeratorItemProps {
  pubkey: string;
  isCreator?: boolean;
  onRemove: () => void;
}

function ModeratorItem({ pubkey, isCreator = false, onRemove }: ModeratorItemProps) {
  const author = useAuthor(pubkey);
  const { user } = useCurrentUser();
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const isCurrentUser = user?.pubkey === pubkey;
  const isOwner = isCreator; // This is passed from the parent component

  return (
    <div className="flex items-center justify-between p-3 border rounded-md">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${pubkey}`}>
          <Avatar className="rounded-md">
            <AvatarImage src={profileImage} />
            <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div>
          <Link to={`/profile/${pubkey}`} className="font-medium hover:underline">
            {displayName}
          </Link>
          <div className="flex items-center gap-2">
            {isOwner ? (
              <span className="text-xs bg-purple-100 text-purple-600 rounded-full px-2 py-0.5">
                Group Owner
              </span>
            ) : (
              <span className="text-xs bg-blue-100 text-blue-600 rounded-full px-2 py-0.5">
                Moderator
              </span>
            )}
            {isCurrentUser && (
              <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                You
              </span>
            )}
          </div>
        </div>
      </div>
      {!isOwner && user && (
        <Button
          variant="outline"
          size="sm"
          className="text-red-600"
          onClick={onRemove}
          disabled={!isCurrentUser && !user?.pubkey}
          title={isOwner ? "The group owner cannot be removed" : ""}
          type="button"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Remove
        </Button>
      )}
    </div>
  );
}

interface MemberItemProps {
  pubkey: string;
  onPromote: () => void;
  isOwner: boolean;
}

function MemberItem({ pubkey, onPromote, isOwner }: MemberItemProps) {
  const author = useAuthor(pubkey);
  const { user } = useCurrentUser();
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || pubkey.slice(0, 8);
  const profileImage = metadata?.picture;
  const isCurrentUser = user?.pubkey === pubkey;

  return (
    <div className="flex items-center justify-between p-3 border rounded-md">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${pubkey}`}>
          <Avatar className="rounded-md">
            <AvatarImage src={profileImage} />
            <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div>
          <Link to={`/profile/${pubkey}`} className="font-medium hover:underline">
            {displayName}
          </Link>
          {isCurrentUser && (
            <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
              You
            </span>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onPromote}
        disabled={!isOwner}
        title={!isOwner ? "Only the group owner can add moderators" : "This will immediately update the group"}
        type="button"
      >
        <UserPlus className="h-4 w-4 mr-1" />
        Make Moderator
      </Button>
    </div>
  );
}

