import { useAtom } from "jotai";
import { UserRole } from "@/lib/types.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";

export const useUserRole = () => {
  const [currentUser] = useAtom(currentUserAtom);

  const isAdmin =
    currentUser?.user?.role === UserRole.ADMIN ||
    currentUser?.user?.role === UserRole.OWNER ||
    currentUser?.user?.role === "admin" ||
    currentUser?.user?.role === "owner";

  const isOwner = currentUser?.user?.role === UserRole.OWNER ||
    currentUser?.user?.role === "owner";

  const isMember = currentUser?.user?.role === UserRole.MEMBER ||
    currentUser?.user?.role === "member";

  return { isAdmin, isOwner, isMember };
};

export default useUserRole;
