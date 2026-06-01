DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users_on_team'
  ) THEN
    CREATE OR REPLACE FUNCTION public.current_user_is_team_member(target_team_id uuid)
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $function$
      SELECT EXISTS (
        SELECT 1
        FROM public.users_on_team
        WHERE team_id = target_team_id
          AND user_id = auth.uid()
      );
    $function$;

    REVOKE ALL ON FUNCTION public.current_user_is_team_member(uuid) FROM public;
    GRANT EXECUTE ON FUNCTION public.current_user_is_team_member(uuid) TO authenticated;

    UPDATE storage.buckets
    SET
      public = true,
      file_size_limit = 52428800,
      allowed_mime_types = ARRAY[
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/svg+xml'
      ]::text[]
    WHERE id = 'avatars';

    DROP POLICY IF EXISTS avatar_public_read ON storage.objects;
    DROP POLICY IF EXISTS avatar_team_member_insert ON storage.objects;
    DROP POLICY IF EXISTS avatar_team_member_update ON storage.objects;
    DROP POLICY IF EXISTS avatar_team_member_delete ON storage.objects;

    CREATE POLICY avatar_public_read
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'avatars');

    CREATE POLICY avatar_team_member_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );

    CREATE POLICY avatar_team_member_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );

    CREATE POLICY avatar_team_member_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );
  END IF;
END $$;
