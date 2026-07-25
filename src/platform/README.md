# Platform boundaries

Application screens, feature logic, repositories, and domain models stay shared.
Only capabilities whose implementation differs by runtime belong here. Metro
selects `.web` files for Expo Web/Electron and the extensionless files for
Android and iOS.

- `database/`: transaction behavior supported by each SQLite runtime.
- `dialogs/`: confirmation and message presentation.
- `documents/`: reading files returned by Expo Document Picker.
- `ui/`: low-level controls that need native browser implementations on web.

Consumers import the extensionless capability path and must not detect Electron
or web themselves. Keep product and domain decisions in their owning feature.
