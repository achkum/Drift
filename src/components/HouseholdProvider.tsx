'use client';
// In-memory household preview state (what you share, what members share with you).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  MEMBERS, SHARE,
  type MemberKey, type ShareFlags, type ShareFlagsWithSensitive, type Viewer,
} from '@/lib/sample/household';

interface HouseholdState {
  share: Record<Viewer, ShareFlagsWithSensitive>;
  setShare(viewer: Viewer, cat: keyof ShareFlagsWithSensitive, on: boolean): void;
  memberShared: Record<MemberKey, ShareFlags>;
  setMemberShared(key: MemberKey, flags: ShareFlags): void;
}

const Ctx = createContext<HouseholdState | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [share, setShareState] = useState(() => ({ sam: { ...SHARE.sam }, maya: { ...SHARE.maya } }));
  const [memberShared, setMemberSharedState] = useState<Record<MemberKey, ShareFlags>>(() => ({
    you: { ...MEMBERS.you.shared }, sam: { ...MEMBERS.sam.shared }, maya: { ...MEMBERS.maya.shared },
  }));

  const value = useMemo<HouseholdState>(() => ({
    share,
    setShare: (viewer, cat, on) => setShareState((s) => ({ ...s, [viewer]: { ...s[viewer], [cat]: on } })),
    memberShared,
    setMemberShared: (key, flags) => setMemberSharedState((s) => ({ ...s, [key]: { ...flags } })),
  }), [share, memberShared]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHousehold(): HouseholdState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useHousehold must be used inside HouseholdProvider');
  return v;
}
