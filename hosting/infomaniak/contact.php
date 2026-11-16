<?php
/**
 * Form endpoint (Infomaniak web hosting, PHP).
 * Receives the form popups (data/forms.yaml, assets/js/form-modal.js) and sends them by email.
 * The "_form" field says which form it is: "contact" or "pitch".
 *
 * Copied to public/contact.php by hosting/infomaniak/build.js.
 * Then set `action: "/contact.php"` for each form in data/forms.yaml.
 */

// ---------------------------------------------------------------------------
// Configuration (TODO: fill in before going live)
// ---------------------------------------------------------------------------

// Sender address: must be an address of the site's domain, hosted at Infomaniak
// (otherwise the emails end up in spam, see SPF / DKIM in the Cloudflare DNS)
const MAIL_FROM = 'TODO@example.org';
const MAIL_FROM_NAME = 'Nous website';

// Sites allowed to post the forms (Origin header). Empty = only the current host.
const ALLOWED_ORIGINS = [
  // 'https://www.example.org',
];

// Anti-spam: maximum number of messages per IP address per hour (all forms)
const RATE_LIMIT = 5;

// The forms. Keep the fields in sync with data/forms.yaml.
// type: text | email | url | textarea — max: maximum length
const FORMS = [
  'contact' => [
    'to' => 'TODO@example.org',
    'subject' => '[Nous] New message from the website',
    'fields' => [
      'name'         => ['label' => 'Name', 'required' => true, 'max' => 200],
      'email'        => ['label' => 'Email', 'type' => 'email', 'required' => true],
      'organisation' => ['label' => 'Organisation / Affiliation', 'max' => 200],
      'interest'     => ['label' => 'Interested in', 'required' => true, 'max' => 200],
      'message'      => ['label' => 'Message', 'type' => 'textarea', 'required' => true, 'max' => 10000],
    ],
  ],
  'pitch' => [
    'to' => 'TODO@example.org',
    'subject' => '[Nous] New provocation pitch',
    'fields' => [
      'name'         => ['label' => 'Name', 'required' => true, 'max' => 200],
      'email'        => ['label' => 'Email', 'type' => 'email', 'required' => true],
      'organisation' => ['label' => 'Organisation / Affiliation', 'max' => 200],
      'website'      => ['label' => 'Website or portfolio', 'type' => 'url', 'max' => 500],
      'proposal'     => ['label' => 'Provocation proposal', 'type' => 'textarea', 'required' => true, 'max' => 1500],
      'why_now'      => ['label' => 'Why this matters now', 'type' => 'textarea', 'max' => 2000],
    ],
  ],
];

// ---------------------------------------------------------------------------

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): void
{
  http_response_code($status);
  echo json_encode($body, JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  header('Allow: POST');
  reply(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

// Same-site check: the forms can only be posted from the site itself
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
  $allowed = ALLOWED_ORIGINS ?: ['https://' . ($_SERVER['HTTP_HOST'] ?? '')];
  if (!in_array(rtrim($origin, '/'), $allowed, true)) {
    reply(403, ['ok' => false, 'error' => 'forbidden_origin']);
  }
}

// Data: JSON (sent by form-modal.js) or classic form fields
$raw = file_get_contents('php://input', false, null, 0, 100000);
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
  $data = $_POST;
}

$get = static function (string $key) use ($data): string {
  return isset($data[$key]) && is_string($data[$key]) ? trim($data[$key]) : '';
};

// Honeypot: filled only by bots. Pretend it worked.
if ($get('_gotcha') !== '') {
  reply(200, ['ok' => true]);
}

$form = FORMS[$get('_form')] ?? null;
if ($form === null) {
  reply(400, ['ok' => false, 'error' => 'unknown_form']);
}

// Validation
$values = [];
$errors = [];
foreach ($form['fields'] as $key => $field) {
  $type = $field['type'] ?? 'text';
  $value = $get($key);
  if ($type !== 'textarea') {
    // One-line fields: no line breaks (protects the email headers)
    $value = preg_replace('/[\r\n\t]+/', ' ', $value);
  }
  $max = $field['max'] ?? 254;
  if (mb_strlen($value) > $max) {
    $errors[] = $key;
  } elseif ($value === '') {
    if (!empty($field['required'])) $errors[] = $key;
  } elseif ($type === 'email' && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
    $errors[] = $key;
  } elseif ($type === 'url' && (!filter_var($value, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $value))) {
    $errors[] = $key;
  }
  $values[$key] = $value;
}
if ($errors) {
  reply(422, ['ok' => false, 'error' => 'invalid', 'fields' => $errors]);
}

// Rate limit per IP (small files in the temporary folder)
$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = sys_get_temp_dir() . '/nous-forms-' . hash('sha256', $ip . date('YmdH'));
$count = is_file($bucket) ? (int) file_get_contents($bucket) : 0;
if ($count >= RATE_LIMIT) {
  reply(429, ['ok' => false, 'error' => 'too_many_requests']);
}
file_put_contents($bucket, (string) ($count + 1), LOCK_EX);

// Email: one-line fields first, then the texts
$lines = [];
$texts = [];
foreach ($form['fields'] as $key => $field) {
  $value = $values[$key] !== '' ? $values[$key] : '-';
  if (($field['type'] ?? 'text') === 'textarea') {
    $texts[] = "{$field['label']}:\n{$value}";
  } else {
    $lines[] = "{$field['label']}: {$value}";
  }
}
$body = implode("\n", $lines) . "\n\n" . implode("\n\n", $texts) . "\n\n"
      . "--\nSent from the website " . ($_SERVER['HTTP_HOST'] ?? '') . "\n";

$headers = [
  'From' => mb_encode_mimeheader(MAIL_FROM_NAME, 'UTF-8') . ' <' . MAIL_FROM . '>',
  'Reply-To' => mb_encode_mimeheader($values['name'] ?? '', 'UTF-8') . ' <' . $values['email'] . '>',
  'MIME-Version' => '1.0',
  'Content-Type' => 'text/plain; charset=UTF-8',
  'Content-Transfer-Encoding' => '8bit',
];

$sent = mail(
  $form['to'],
  mb_encode_mimeheader($form['subject'], 'UTF-8'),
  $body,
  $headers,
  '-f' . MAIL_FROM
);

if (!$sent) {
  reply(500, ['ok' => false, 'error' => 'mail_failed']);
}

reply(200, ['ok' => true]);
