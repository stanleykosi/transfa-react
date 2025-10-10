-- Add JSON validation function to help with JSONB insertion
-- This function can be used to validate JSON before insertion

CREATE OR REPLACE FUNCTION is_valid_json(input_text text) RETURNS boolean AS $$
BEGIN
    PERFORM input_text::json;
    RETURN TRUE;
EXCEPTION
    WHEN others THEN
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment to the function
COMMENT ON FUNCTION is_valid_json(text) IS 'Validates if the input text is valid JSON format';
