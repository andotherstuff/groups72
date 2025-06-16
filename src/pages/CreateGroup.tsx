import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTrackEngagement } from "@/hooks/useTrackEngagement";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUploadFile } from "@/hooks/useUploadFile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import Header from "@/components/ui/Header";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Upload } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { KINDS } from "@/lib/nostr-kinds";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Create a schema for form validation
const formSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
  guidelines: z.string().optional(),
  imageUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function CreateGroup() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending: isSubmitting } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  // Initialize the form with react-hook-form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      guidelines: "",
      imageUrl: "",
    },
  });

  // Generate a unique identifier based on the group name and timestamp
  const generateUniqueIdentifier = (name: string): string => {
    const baseId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const timestamp = Date.now().toString(36);
    return `${baseId}-${timestamp}`;
  };

  if (!user) {
    return (
      <div className="container mx-auto py-1 px-3 sm:px-4">
        <h1 className="text-2xl font-bold mb-4">You must be logged in to create a group</h1>
        <Button asChild>
          <Link to="/groups">Back to Groups</Link>
        </Button>
      </div>
    );
  }

  // Handle file uploads for group image
  const uploadGroupImage = async (file: File) => {
    try {
      // The first tuple in the array contains the URL
      const [[_, url]] = await uploadFile(file);
      form.setValue('imageUrl', url);
      toast({
        title: 'Success',
        description: 'Group image uploaded successfully',
      });
    } catch (error) {
      console.error('Failed to upload group image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload group image. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // Generate unique identifier
      const identifier = generateUniqueIdentifier(values.name);

      // Create community event (kind 34550)
      const tags = [
        ["d", identifier],
        ["name", values.name],
      ];

      // Add description tag if provided
      if (values.description) {
        tags.push(["description", values.description]);
      }

      // Add guidelines tag if provided
      if (values.guidelines) {
        tags.push(["guidelines", values.guidelines]);
      }

      // Add image tag if available
      if (values.imageUrl) {
        tags.push(["image", values.imageUrl]);
      }

      // Add current user as moderator
      tags.push(["p", user.pubkey, "", "moderator"]);

      // Publish the community event
      await publishEvent({
        kind: KINDS.GROUP,
        tags,
        content: "",
      });

      toast({
        title: 'Success',
        description: 'Group created successfully!',
      });
      navigate("/groups");
    } catch (error) {
      console.error("Error creating community:", error);
      toast({
        title: 'Error',
        description: 'Failed to create group. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-1 px-3 sm:px-4">
      <Header />
      <div className="my-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Create a Group</h1>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex flex-col items-center mb-6">
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <div className="text-center">
                    <div className="mb-4 relative mx-auto">
                      <Avatar className="h-24 w-24 rounded-full mx-auto">
                        <AvatarImage src={field.value} />
                        <AvatarFallback className="text-xl">
                          {form.getValues().name?.slice(0, 2).toUpperCase() || 'GP'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute bottom-0 right-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8 rounded-full shadow"
                          onClick={() => document.getElementById('image-upload')?.click()}
                        >
                          <Upload className="h-4 w-4" />
                        </Button>
                        <input
                          id="image-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadGroupImage(file);
                            }
                          }}
                        />
                      </div>
                    </div>
                    <FormDescription className="text-center text-sm">
                      Upload a group image
                    </FormDescription>
                    <FormMessage />
                  </div>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="My Awesome Group" {...field} className="bg-background" />
                    </FormControl>
                    <FormDescription>
                      This is the name that will be displayed to others.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Tell people what your group is about..." 
                        {...field}
                        rows={4}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormDescription>
                      Provide a brief description of what your group is about.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="guidelines"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Guidelines</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Set community rules and guidelines for members to follow..." 
                        {...field}
                        rows={4}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormDescription>
                      Define rules and expectations for group members. This is optional.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-col gap-2 pt-4">
              <Button
                type="submit"
                className="w-full max-w-[200px] flex items-center justify-center gap-2 mx-auto"
                disabled={isSubmitting || isUploading || !form.watch('name')?.trim()}
              >
                {(isSubmitting || isUploading) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Group
              </Button>
              
              <div className="text-center mt-2">
                <Button
                  type="button"
                  variant="link"
                  className="text-muted-foreground"
                  onClick={() => navigate("/groups")}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
