/** Tab order, labels and icons (used by the web tab bar; the native bar declares the same tabs). */
export const TAB_ITEMS = [
  { name: 'index', href: '/', label: 'Today', icon: { ios: 'mic.fill', android: 'mic' } },
  { name: 'journal', href: '/journal', label: 'Journal', icon: { ios: 'book.fill', android: 'menu_book' } },
  { name: 'insights', href: '/insights', label: 'Insights', icon: { ios: 'chart.xyaxis.line', android: 'insights' } },
  { name: 'chat', href: '/chat', label: 'Ask', icon: { ios: 'bubble.left.and.bubble.right.fill', android: 'forum' } },
  { name: 'profile', href: '/profile', label: 'You', icon: { ios: 'person.crop.circle.fill', android: 'account_circle' } },
] as const;
