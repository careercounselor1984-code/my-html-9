-- Include own event revision token; other staff only get null.
CREATE OR REPLACE FUNCTION public.schedule_get_snapshot_v17()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me record; v_out jsonb;
begin
 select id,center,display_name,role into me from public.schedule_staff
 where auth_user_id=auth.uid() and is_active;
 if not found then raise exception '직원 인증이 필요합니다'; end if;
 select jsonb_build_object(
   'identity',jsonb_build_object('id',me.id,'name',me.display_name,'center',me.center,'role',me.role),
   'staff',coalesce((select jsonb_agg(jsonb_build_object('name',s.display_name,'center',s.center,'role',s.role) order by s.display_name)
      from public.schedule_staff s where s.is_active and (s.center=me.center or me.role='director')),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(
       (case when e.staff_id=me.id then e.payload
             when coalesce(e.payload->>'kind',case when e.payload->>'type' in
               ('초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계')
               then 'consult' else 'work' end)='work'
             then e.payload - 'memo' - 'participantId'
             else jsonb_set(e.payload,'{title}',to_jsonb(public.schedule_mask_name(e.payload->>'title')),true) - 'memo' - 'participantId'
        end) || jsonb_build_object('id',e.id,'center',s.center,'owner',s.display_name,'date',e.event_date::text,
          'readonly',e.staff_id<>me.id,'_serverVersion',case when e.staff_id=me.id then e.updated_at::text else null end) order by e.event_date,e.id)
      from public.schedule_events e join public.schedule_staff s on s.id=e.staff_id
      where s.is_active and (s.center=me.center or me.role='director')),'[]'::jsonb),
   'participants',coalesce((select jsonb_agg(p.payload||jsonb_build_object('id',p.id,'center',me.center,'owner',me.display_name))
     from public.schedule_participants p where p.staff_id=me.id),'[]'::jsonb),
   'offs',coalesce((select jsonb_agg(o.payload||jsonb_build_object('id',o.id,'center',o.center,'readonly',o.created_by<>me.id))
     from public.schedule_closures o where o.center in ('all',me.center) or me.role='director'),'[]'::jsonb),
   'notices',coalesce((select jsonb_agg(n.payload||jsonb_build_object('id',n.id,'center',n.center,'readonly',n.created_by<>me.id))
     from public.schedule_notices n where n.center in ('all',me.center) or me.role='director'),'[]'::jsonb)
 ) into v_out;return v_out;
end $function$
;
