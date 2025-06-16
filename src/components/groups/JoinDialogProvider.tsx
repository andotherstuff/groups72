import { JoinDialogContext } from "./JoinDialogContext";
import React, { createContext, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { toast } from "sonner";
import { useTrackEngagement } from "@/hooks/useTrackEngagement";


export function JoinDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [joinReason, setJoinReason] = useState("");
  const [currentCommunityId, setCurrentCommunityId] = useState("");
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { trackJoinedGroup } = useTrackEngagement();

  // Function to open the dialog with a specific communityId
  const openJoinDialog = useCallback((communityId: string) => {
    setCurrentCommunityId(communityId);
    setJoinReason("");
    setIsOpen(true);
  }, []);

  // Handle join request submission
  const handleRequestJoin = async () => {
    if (!user) {
      toast.error("You must be logged in to request to join a group");
      return;
    }

    try {
      // Create join request event (kind 4552)
      await publishEvent({
        kind: 4552,
        tags: [
          ["a", currentCommunityId],
        ],
        content: joinReason,
      });

      // Track that the user has joined a group
      trackJoinedGroup();

      toast.success("Join request sent successfully!");
      setIsOpen(false);
    } catch (error) {
      console.error("Error sending join request:", error);
      toast.error("Failed to send join request. Please try again.");
    }
  };

  const closeJoinDialog = useCallback(() => {
    setIsOpen(false);
    setJoinReason("");
  }, []);

  const contextValue = {
    openJoinDialog,
    closeJoinDialog,
    isDialogOpen: isOpen,
  };
  return (
    <JoinDialogContext.Provider value={contextValue}>
      {children}
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Request to Join Group</DialogTitle>
            <DialogDescription>
              This is a closed group. Send a join request to the group administrators for approval.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">
                Why do you want to join this group? (optional)
              </Label>
              <Textarea
                id="reason"
                placeholder="Tell the admins why you'd like to join..."
                value={joinReason}
                onChange={(e) => setJoinReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeJoinDialog}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleRequestJoin}
              disabled={isPending}
            >
              {isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </JoinDialogContext.Provider>
  );
}
