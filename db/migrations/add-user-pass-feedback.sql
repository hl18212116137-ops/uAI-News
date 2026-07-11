ALTER TABLE passed_posts DROP CONSTRAINT IF EXISTS passed_posts_pass_type_check;
ALTER TABLE passed_posts
  ADD CONSTRAINT passed_posts_pass_type_check
  CHECK (pass_type IN ('low_signal', 'ai_unimportant', 'user_pass', 'duplicate', 'processing_failed'));

ALTER TABLE pass_feedback DROP CONSTRAINT IF EXISTS pass_feedback_action_check;
ALTER TABLE pass_feedback
  ADD CONSTRAINT pass_feedback_action_check
  CHECK (action IN ('promote_from_pass', 'pass_from_feed'));
