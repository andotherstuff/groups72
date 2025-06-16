import { useMutation } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCashuWallet } from '@/hooks/useCashuWallet';
import { useTrackEngagement } from "@/hooks/useTrackEngagement";
import { useCashuStore } from '@/stores/cashuStore';
import { defaultMints } from '@/lib/cashu';
import { generateSecretKey } from 'nostr-tools';
import { bytesToHex } from "@noble/hashes/utils";

/**
 * Hook for creating a Cashu wallet using the user's Nostr identity
 * 
 * @returns A mutation for creating a Cashu wallet
 */
export function useCreateCashuWallet() {
  const { user } = useCurrentUser();
  const { createWallet } = useCashuWallet();
  const cashuStore = useCashuStore();
  const { trackSetWallet } = useTrackEngagement();

  return useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('You must be logged in to create a wallet');
      }

      try {
        const privkey = bytesToHex(generateSecretKey());
        cashuStore.setPrivkey(privkey);

        // Create a new wallet with the default mint
        const mints = cashuStore.mints.map((m) => m.url);
        // add default mints
        mints.push(...defaultMints);

        createWallet({
          privkey,
          mints,
        });

        // Track that the user has set up a wallet
        trackSetWallet();

        return { success: true };
      } catch (error) {
        console.error('Failed to derive private key:', error);
        throw new Error('Failed to create wallet. Please try again.');
      }
    }
  });
}