module.exports = {
  emails: function () {
    try {
      const bytes = $os.readFile($os.getenv('COMMITTEE_ALLOWLIST_FILE'));
      const text =
        typeof bytes === 'string'
          ? bytes
          : String.fromCharCode.apply(null, bytes);
      const emails = JSON.parse(text);
      if (
        !Array.isArray(emails) ||
        !emails.every(
          (x) =>
            typeof x === 'string' &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.trim()),
        )
      )
        return [];
      return emails.map((x) => x.trim().toLowerCase());
    } catch (_) {
      return [];
    }
  },
  check: function (app, record) {
    if (
      !record ||
      record.collection().name !== 'committee_users' ||
      !record.verified()
    )
      throw new ForbiddenError('Committee access required.');
    if (this.emails().indexOf(record.email().trim().toLowerCase()) < 0)
      throw new ForbiddenError('Committee access revoked or unavailable.');
    if (
      !app
        .findAllExternalAuthsByRecord(record)
        .some((x) => x.provider() === 'google')
    )
      throw new ForbiddenError('Google identity required.');
  },
};
