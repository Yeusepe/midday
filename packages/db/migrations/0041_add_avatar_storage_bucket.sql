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
      'avatars',
      'avatars',
      true,
      5242880,
      ARRAY[
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/svg+xml'
      ]::text[]
    )
    ON CONFLICT (id) DO UPDATE
    SET
      public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

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
        AND (storage.foldername(name))[1] IN (
          SELECT team_id::text
          FROM public.users_on_team
          WHERE user_id = auth.uid()
        )
      );

    CREATE POLICY avatar_team_member_update
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] IN (
          SELECT team_id::text
          FROM public.users_on_team
          WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] IN (
          SELECT team_id::text
          FROM public.users_on_team
          WHERE user_id = auth.uid()
        )
      );

    CREATE POLICY avatar_team_member_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] IN (
          SELECT team_id::text
          FROM public.users_on_team
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
