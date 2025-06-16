import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { JoinDialogContext } from "./JoinDialogContext";

// Create a provider component
export function JoinDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [joinReason, setJoinReason] = useState("");
  const [currentCommunityId, setCurrentCommunityId] = useState("");
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();

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

      toast.success("Join request sent successfully!");
      setIsOpen(false);
    } catch (error) {
      console.error("Error sending join request:", error);
      toast.error("Failed to send join request. Please try again.");
    }
  };

  return (
    <JoinDialogContext.Provider value={{ openJoinDialog, isDialogOpen: isOpen }}>
      {children}

      {/* The dialog is rendered at the portal level */}
      {createPortal(
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request to join this group</DialogTitle>
              <DialogDescription>
                Your request will be reviewed by the group moderators.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4">
              <label htmlFor="join-reason" className="text-sm font-medium mb-2 block">
                Why do you want to join this group? (optional)
              </label>
              <Textarea
                id="join-reason"
                placeholder="Tell the moderators why you'd like to join..."
                value={joinReason}
                onChange={(e) => setJoinReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <DialogFooter className="flex flex-col gap-2">
              <Button onClick={handleRequestJoin} disabled={isPending}>
                {isPending ? "Sending..." : "Send request"}
              </Button>
              <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
        document.body
      )}
    </JoinDialogContext.Provider>
  );
}