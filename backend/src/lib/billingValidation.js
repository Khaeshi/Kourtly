export const MAX_ITEM_PRICE = 10000;
export const MAX_LINE_QUANTITY = 100;
export const MAX_TAB_TOTAL = 100000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export function readAllowedBody(body, allowedFields) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object.');
  }
  for (const key of Object.keys(body)) {
    if (key.startsWith('$') || key.includes('.') ||
        ['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new Error('Operator and dotted-path keys are not allowed.');
    }
    if (!allowedFields.includes(key)) {
      throw new Error(`${key} is not an allowed field.`);
    }
  }
  return body;
}

export function readItemPrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      value < 0 || value > MAX_ITEM_PRICE) {
    throw new Error(`price must be a finite number from 0 to ${MAX_ITEM_PRICE}.`);
  }
  return value;
}

export function readLineQuantity(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) ||
      value < 1 || value > MAX_LINE_QUANTITY) {
    throw new Error(`quantity must be an integer from 1 to ${MAX_LINE_QUANTITY}.`);
  }
  return value;
}

export function readIdempotencyKey(value) {
  if (value !== undefined &&
      (typeof value !== 'string' || value.length > MAX_IDEMPOTENCY_KEY_LENGTH)) {
    throw new Error(`idempotencyKey must be a string no longer than ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`);
  }
  return value || null;
}

export function readTabTotal(currentTotal, lineTotal) {
  const updatedTotal = currentTotal + lineTotal;
  if (typeof currentTotal !== 'number' || !Number.isFinite(currentTotal) ||
      currentTotal < 0 || currentTotal > MAX_TAB_TOTAL ||
      !Number.isFinite(lineTotal) || lineTotal < 0 ||
      !Number.isFinite(updatedTotal) || updatedTotal > MAX_TAB_TOTAL) {
    throw new Error(`tab total must remain between 0 and ${MAX_TAB_TOTAL}.`);
  }
  return updatedTotal;
}
