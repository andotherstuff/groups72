import { useState, useEffect, useRef } from "react";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUploadFile } from "@/hooks/useUploadFile";
import { useAuthor } from "@/hooks/useAuthor";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Image, Loader2, Send, XCircle, Mic, Square } from "lucide-react";
import { parseNostrAddress } from "@/lib/nostr-utils";
import { Link } from "react-router-dom";
import { KINDS } from "@/lib/nostr-kinds";

interface CreatePostFormProps {
  communityId: string;
  onPostSuccess?: () => void;
}

export function CreatePostForm({ communityId, onPostSuccess }: CreatePostFormProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  
  // Move useAuthor hook before any conditional returns
  const author = useAuthor(user?.pubkey || '');
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || user?.pubkey.slice(0, 8) || '';
  const profileImage = metadata?.picture;

  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up object URLs when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl && (mediaFile?.type.startsWith('video/') || mediaFile?.type.startsWith('audio/'))) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, mediaFile]);

  // Clean up recording interval on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use audio-specific MIME types in order of preference
      const audioMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus', 
        'audio/mp4',
        'audio/webm'  // fallback
      ];
      
      let selectedMimeType = 'audio/webm';
      for (const mimeType of audioMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Get the MIME type that was actually used
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        
        // Determine file extension based on MIME type
        let extension = 'webm';
        if (mimeType.includes('ogg')) {
          extension = 'ogg';
        } else if (mimeType.includes('mp4')) {
          extension = 'm4a';
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const audioFile = new File([audioBlob], `voice_memo_${Date.now()}.${extension}`, { type: mimeType });
        
        // Clean up previous media if any
        if (previewUrl && (mediaFile?.type.startsWith('video/') || mediaFile?.type.startsWith('audio/'))) {
          URL.revokeObjectURL(previewUrl);
        }
        
        setMediaFile(audioFile);
        // Create URL from the blob instead of the file for better compatibility
        const url = URL.createObjectURL(audioBlob);
        setPreviewUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      // Start duration counter
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error('マイクにアクセスできませんでした。権限を確認してください。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!user) return null;

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      
      // Clean up previous object URL if it exists
      if (previewUrl && (mediaFile?.type.startsWith('video/') || mediaFile?.type.startsWith('audio/'))) {
        URL.revokeObjectURL(previewUrl);
      }
      
      setMediaFile(file);

      // For videos and audio, use object URL for preview
      if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } else {
        // For images, use FileReader as before
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !mediaFile) {
      toast.error("コンテンツを入力するか、メディアを追加してください");
      return;
    }

    try {
      const parsedId = parseNostrAddress(communityId);
      if (!parsedId) {
        toast.error("無効なグループID");
        return;
      }

      // Add mic emoji to content if this is a voice recording
      let baseContent = content;
      if (mediaFile && mediaFile.name.includes('voice_memo')) {
        baseContent = `🎤 ${content}`.trim();
      }

      let finalContent = baseContent;
      let imageTags: string[][] = [];

      if (mediaFile) {
        const tags = await uploadFile(mediaFile);
        const [[_, mediaUrl]] = tags;
        finalContent += `

${mediaUrl}`;
        imageTags = tags;
      }

      // Extract hashtags from content and create 't' tags
      const hashtagMatches = content.match(/#(\w+)/g);
      const hashtagTags: string[][] = hashtagMatches 
        ? hashtagMatches.map(hashtag => ["t", hashtag.slice(1).toLowerCase()])
        : [];

      const tags = [
        ["a", communityId],
        ["subject", `Post in ${parsedId?.identifier || 'group'}`],
        ...imageTags,
        ...hashtagTags,
      ];

      await publishEvent({
        kind: KINDS.GROUP_POST,
        tags,
        content: finalContent,
      });

      setContent("");
      setMediaFile(null);
      setPreviewUrl(null);

      toast.success("投稿が正常に公開されました！");
      
      // Call the onPostSuccess callback if provided
      if (onPostSuccess) {
        onPostSuccess();
      }
    } catch (error) {
      console.error("Error publishing post:", error);
      toast.error("投稿の公開に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <div className="flex gap-2">
          <Link to={`/profile/${user.pubkey}`}>
            <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity rounded-md">
              <AvatarImage src={profileImage} />
              <AvatarFallback>{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </Link>

          <div className="flex-1">
            <Textarea
              placeholder={`何を考えていますか、${displayName.split(' ')[0]}さん？`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-20 resize-none p-2"
            />

            {previewUrl && (
              <div className="mt-1.5 relative">
                {mediaFile?.type.startsWith('video/') ? (
                  <video
                    src={previewUrl}
                    controls
                    className="max-h-52 rounded-md object-contain border w-full"
                  />
                ) : mediaFile?.type.startsWith('audio/') ? (
                  <div className="bg-secondary/50 rounded-md border p-3 flex items-center gap-3">
                    {mediaFile.name.includes('voice_memo') ? (
                      <>
                        <div className="bg-green-500/10 rounded-full p-2">
                          <Mic className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">音声録音</div>
                          <div className="text-xs text-muted-foreground">
                            送信準備完了 • {(mediaFile.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{mediaFile.name}</div>
                          <div className="text-xs text-muted-foreground">
                            音声ファイル • {(mediaFile.size / 1024).toFixed(0)} KB
                          </div>
                        </div>
                        <audio
                          src={previewUrl}
                          controls
                          className="h-8"
                          style={{ width: '200px' }}
                          onError={(e) => {
                            console.error('Audio preview error:', e);
                          }}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-52 rounded-md object-contain border"
                  />
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-5 w-5"
                  onClick={() => {
                    // Clean up object URL if it's a video or audio
                    if (previewUrl && (mediaFile?.type.startsWith('video/') || mediaFile?.type.startsWith('audio/'))) {
                      URL.revokeObjectURL(previewUrl);
                    }
                    setMediaFile(null);
                    setPreviewUrl(null);
                  }}
                >
                  <XCircle className="h-3 w-3"/>
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between items-center border-t px-3 py-2">
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="text-muted-foreground h-8 px-2 text-xs" asChild>
            <label htmlFor="media-upload" className="cursor-pointer flex items-center">
              <Image className="h-3.5 w-3.5 mr-1" />
              メディア
              <input
                id="media-upload"
                type="file"
                accept="image/*,video/*,audio/*"
                onChange={handleMediaSelect}
                className="hidden"
                disabled={isRecording}
              />
            </label>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            className={`text-muted-foreground h-8 px-2 text-xs ${isRecording ? 'text-red-500' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isPublishing || isUploading}
          >
            {isRecording ? (
              <>
                <Square className="h-3.5 w-3.5 mr-1 fill-current" />
                {formatDuration(recordingDuration)}
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5 mr-1" />
                録音
              </>
            )}
          </Button>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isPublishing || isUploading || (!content.trim() && !mediaFile)}
          size="sm"
          className="h-8 px-3 text-xs"
        >
          {isPublishing || isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              投稿中...
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 mr-1.5" />
              投稿
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
