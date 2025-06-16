import { useCurrentUser } from '@/hooks/useCurrentUser';

export function useTrackEngagement() {
  const { user } = useCurrentUser();

  const trackJoinedGroup = () => {
    if (user) {
      localStorage.setItem(`has-joined-group:${user.pubkey}`, 'true');
    }
  };

  const trackSetWallet = () => {
    if (user) {
      localStorage.setItem(`has-set-wallet:${user.pubkey}`, 'true');
    }
  };

  const trackCreatedGroup = () => {
    if (user) {
      localStorage.setItem(`has-created-group:${user.pubkey}`, 'true');
    }
  };

  return {
    trackJoinedGroup,
    trackSetWallet,
    trackCreatedGroup
  };
}
