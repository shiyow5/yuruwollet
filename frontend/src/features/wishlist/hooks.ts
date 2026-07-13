import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/queryKeys';
import { subscribeToTable, type RealtimeStatus } from '../../lib/realtime';
import { useWriteContext } from '../shared/session';
import {
  listWishlist,
  createWishlistItem,
  completeWishlistItem,
  restoreWishlistItem,
  deleteWishlistItem,
} from '../../lib/data/wishlist';
import type { WishGenre } from '../../lib/wishlist/types';

export function useWishlist(archived: boolean) {
  return useQuery({
    queryKey: queryKeys.wishlist(archived),
    queryFn: () => listWishlist(supabase, archived),
  });
}

/** 現役リストと思い出アーカイブは行き来するので、どちらも無効化する。 */
function invalidateWishlist(qc: ReturnType<typeof useQueryClient>): void {
  void qc.invalidateQueries({ queryKey: ['wishlist'] });
}

/**
 * 相手の変更を自分の画面に反映する購読。
 * 購読が確立するたびに（再接続を含む）一覧を取り直すので、切断中の変更も拾える。
 */
export function useWishlistRealtime(): RealtimeStatus {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  const householdId = ctx?.householdId ?? '';
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    if (householdId === '') return;
    return subscribeToTable(supabase, {
      table: 'wishlist_items',
      householdId,
      onChange: () => invalidateWishlist(qc),
      onStatus: setStatus,
    });
  }, [householdId, qc]);

  return status;
}

export interface NewWishlistItem {
  genre: WishGenre;
  title: string;
  url: string;
  memo: string;
}

export function useCreateWishlistItem() {
  const qc = useQueryClient();
  const ctx = useWriteContext();
  return useMutation({
    mutationFn: (input: NewWishlistItem) => {
      if (!ctx) throw new Error('セッションが確立していません');
      return createWishlistItem(supabase, {
        householdId: ctx.householdId,
        registrantId: ctx.memberId,
        ...input,
      });
    },
    onSettled: () => invalidateWishlist(qc),
  });
}

export function useCompleteWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeWishlistItem(supabase, id),
    onSettled: () => invalidateWishlist(qc),
  });
}

export function useRestoreWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreWishlistItem(supabase, id),
    onSettled: () => invalidateWishlist(qc),
  });
}

export function useDeleteWishlistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWishlistItem(supabase, id),
    onSettled: () => invalidateWishlist(qc),
  });
}
