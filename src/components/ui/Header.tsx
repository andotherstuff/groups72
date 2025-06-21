import { LoginArea } from "@/components/auth/LoginArea";
import { BalanceDisplay } from "@/components/BalanceDisplay";
import { ClaimOnboardingTokenButton } from "@/components/ClaimOnboardingTokenButton";
import { useCashuStore } from "@/stores/cashuStore";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Icon } from "@/components/ui/Icon";
import type React from "react";
import { Link, useLocation } from "react-router-dom";

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className }) => {
  const cashuStore = useCashuStore();
  const onboardingStore = useOnboardingStore();
  const { user } = useCurrentUser();
  const location = useLocation();

  // Check if we should show the claim button
  const pendingToken = cashuStore.getPendingOnboardingToken();
  const hasClaimedToken = onboardingStore.isTokenClaimed();
  const showClaimButton = user && pendingToken && !hasClaimedToken;

  // Helper to determine active link
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className={`flex justify-between items-center safe-area-top ${className || ""}`}>
      <div className="flex items-baseline gap-2">
        <Link to="/" className="contents">
          <h1 className="text-2xl font-bold flex flex-row items-center leading-none">
            <span className="text-red-500 font-extrabold text-3xl">+</span>
            chorus
          </h1>
        </Link>
        {user && (
          <div className="flex space-x-3 ml-1">
            <Link 
              to="/groups" 
              className={`text-sm ${isActive('/groups') 
                ? 'text-primary hover:text-primary/90' 
                : 'text-gray-500/60 hover:text-gray-700 dark:text-gray-400/60 dark:hover:text-gray-200'} 
                transition-all flex items-center`}
            >
              <Icon name="Home" size={16} className="mr-1" />
              <span className="hidden sm:inline">グループ</span>
            </Link>
            <Link 
              to="/feed" 
              className={`text-sm ${isActive('/feed') 
                ? 'text-primary hover:text-primary/90' 
                : 'text-gray-500/60 hover:text-gray-700 dark:text-gray-400/60 dark:hover:text-gray-200'} 
                transition-all flex items-center`}
            >
              <Icon name="Feed" size={16} className="mr-1" />
              <span className="hidden sm:inline">フィード</span>
            </Link>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {showClaimButton ? <ClaimOnboardingTokenButton /> : <BalanceDisplay />}
        <LoginArea />
      </div>
    </div>
  );
};

export default Header;