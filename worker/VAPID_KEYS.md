# VAPID Keys for Push Notifications

## Public Key (Client-side)
This key is safe to use in your frontend code and can be committed to the repository.

```
BPgDsbapJe78f06TJ0PFzoLGLsYR6w8Dtl86NcNn0OirUtuxm3i2cluBrI1Xlb5RENvCnLX2S2SA2aGmi9DyhOU
```

Add to your `.env.local` file:
```
VITE_VAPID_PUBLIC_KEY=BPgDsbapJe78f06TJ0PFzoLGLsYR6w8Dtl86NcNn0OirUtuxm3i2cluBrI1Xlb5RENvCnLX2S2SA2aGmi9DyhOU
```

## Private Key (Server-side) 🔒
**KEEP THIS SECRET! Never commit to repository or expose in client code!**

The private key should be added to your Cloudflare Worker as a secret:

1. Run this command in the worker/cloudflare-worker directory:
   ```
   wrangler secret put VAPID_PRIVATE_KEY
   ```

2. When prompted, paste this key:
   ```
   j0XcVju6mRn94xN82R4Ti7FowCPj5V9ipdnnorCbvAQ
   ```

3. Also add the VAPID subject (your email):
   ```
   wrangler secret put VAPID_SUBJECT
   ```
   Then enter: `mailto:your-email@example.com`

## Usage in Worker

In your Cloudflare Worker, access these secrets via the `env` parameter:
```javascript
const privateKey = env.VAPID_PRIVATE_KEY;
const subject = env.VAPID_SUBJECT;
```

Never log or expose the private key!
