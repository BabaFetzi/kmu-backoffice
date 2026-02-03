-- Minimal repro: duplicate stock movements when setting status to DONE twice
-- Preconditions:
-- 1) An order exists with status = 'open'
-- 2) At least one order_line exists for that order
-- 3) A DB trigger/function creates stock_movements when status changes to 'done'
--
-- Replace :order_id with a real order id.

BEGIN;

-- First status change to DONE
UPDATE orders
SET status = 'done'
WHERE id = :order_id;

-- Accidental second update to the same status (e.g., double click / retry)
UPDATE orders
SET status = 'done'
WHERE id = :order_id;

COMMIT;

-- Inspect movements created for that order
SELECT id, order_id, order_line_id, movement_type, qty, created_at
FROM stock_movements
WHERE order_id = :order_id
ORDER BY created_at DESC;
