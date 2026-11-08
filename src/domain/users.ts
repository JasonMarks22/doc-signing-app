import type { User } from './types';

/** Fake "accounts". There is no real auth: the header switcher picks one of these. */
export const USERS: User[] = [
  {
    id: 'u-alex',
    name: 'Alex Rivera',
    email: 'alex@lonestarfleet.example',
    title: 'Contracts Manager',
    company: 'Lone Star Fleet Services',
  },
  {
    id: 'u-dana',
    name: 'Dana Whitfield',
    email: 'dana@acmefreight.example',
    title: 'Purchasing Director',
    company: 'Acme Freight Co.',
  },
  {
    id: 'u-sam',
    name: 'Sam Okafor',
    email: 'sam@bluebonnetlogistics.example',
    title: 'Operations Lead',
    company: 'Bluebonnet Logistics',
  },
];

export function findUser(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export function findUserByEmail(email: string): User | undefined {
  return USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}
