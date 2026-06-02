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
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'vault',
      'vault',
      false,
      52428800,
      NULL
    )
    ON CONFLICT (id) DO UPDATE
    SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

    DROP POLICY IF EXISTS vault_team_member_select ON storage.objects;
    DROP POLICY IF EXISTS vault_team_member_insert ON storage.objects;
    DROP POLICY IF EXISTS vault_team_member_update ON storage.objects;
    DROP POLICY IF EXISTS vault_team_member_delete ON storage.objects;

    CREATE POLICY vault_team_member_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'vault'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );

    CREATE POLICY vault_team_member_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'vault'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );

    CREATE POLICY vault_team_member_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'vault'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      )
      WITH CHECK (
        bucket_id = 'vault'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR (
            (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND public.current_user_is_team_member(((storage.foldername(name))[1])::uuid)
          )
        )
      );

    CREATE POLICY vault_team_member_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'vault'
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
