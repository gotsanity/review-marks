# Changelog

## 0.1.0 (2026-10-30)


### Features

* add commands to move comments to the end of the note or of sections ([2b1f3ea](https://github.com/gotsanity/review-marks/commit/2b1f3ea89f0e4849dd701f9b7d06ac0e2cae5e1c))
* add the annotations sidebar, a status bar count and Edit comment at cursor ([bd4472b](https://github.com/gotsanity/review-marks/commit/bd4472b2b85fab74e9f5d7832b97a47461723973))
* add the comment placement setting control ([2401519](https://github.com/gotsanity/review-marks/commit/2401519ddb7251fac78913ba9f9a6d02edecfc41))
* add the highlight colour setting and make Target taps open the popover on mobile ([f816ab3](https://github.com/gotsanity/review-marks/commit/f816ab30a2c46bb1efac21cbadb33832e72e63d6))
* annotate a passage across paragraphs, list items and headings ([84b3a68](https://github.com/gotsanity/review-marks/commit/84b3a68c09c320ada143e9ae6650a925ca191c2e))
* annotate a selection and see it highlighted in Live Preview ([3293a83](https://github.com/gotsanity/review-marks/commit/3293a8383ea2f4b2740dfb1d95347c9444c513c9)), closes [#20](https://github.com/gotsanity/review-marks/issues/20)
* annotate by holding a key and drag-selecting in Live Preview and Source mode ([6286de4](https://github.com/gotsanity/review-marks/commit/6286de42839dbc045abcd51968749404d8238a47))
* annotate on drag from Reading view, switching to Live Preview at the same spot ([62be358](https://github.com/gotsanity/review-marks/commit/62be358568076962d7d8c48b2f05c10583e3343c))
* export PDF and Copy as HTML without braces, with an option to strip annotations ([4b49aa8](https://github.com/gotsanity/review-marks/commit/4b49aa8d2de9b2b4499d8aae708943c478be5508))
* navigate between annotations, remove at cursor, context menu and Backspace ([b87782f](https://github.com/gotsanity/review-marks/commit/b87782faf2c45608e1a6b0634ccb13cc0e2f8bc0)), closes [#28](https://github.com/gotsanity/review-marks/issues/28)
* refuse a Target that crosses table cells ([14857ff](https://github.com/gotsanity/review-marks/commit/14857ff4c8c6661d928c97c5047d66e82bf7f5f8))
* refuse targets inside other plugins' syntax, skip Excalidraw, fix duplicate IDs ([3da5de7](https://github.com/gotsanity/review-marks/commit/3da5de7f5883f87cf4580ae3b0ee2391e915f3ec)), closes [#29](https://github.com/gotsanity/review-marks/issues/29)
* Review Marks v1 ([fe1759a](https://github.com/gotsanity/review-marks/commit/fe1759a2898c4f73d010010c8120c081be365f61))
* show annotations in Reading view, with a comment popover and display settings ([7b6caa6](https://github.com/gotsanity/review-marks/commit/7b6caa6ddd661dfd9ba0108d7b8be4380325b59e))
* show annotations in table cells in Live Preview ([5ab6c97](https://github.com/gotsanity/review-marks/commit/5ab6c97fd16dbdc93438db85fc21ae0af4071c30))
* write new comments in the reading order of their markers ([7707a5b](https://github.com/gotsanity/review-marks/commit/7707a5be66eedca7b9ff1ed0ca622e5007beec58))


### Bug Fixes

* annotate on drag inside Live Preview tables ([93a8dc4](https://github.com/gotsanity/review-marks/commit/93a8dc4228d4e054c905ee166d056aa0aaefe184))
* close the popover when its Target or its note goes away ([f6ff8fd](https://github.com/gotsanity/review-marks/commit/f6ff8fdc5188ed8da62c6bf951e7cf80336fbc37))
* keep loading when CodeMirror has no focusChangeEffect ([6d63420](https://github.com/gotsanity/review-marks/commit/6d634201620ce1f1e8f6932207fef8e75fea824d))
* keep scrolling Reading view until the next annotation is rendered ([e425284](https://github.com/gotsanity/review-marks/commit/e4252842c374925b98ed11f3906e33100dda3908))
* label the status bar setting as the spec words it ([f72ba3e](https://github.com/gotsanity/review-marks/commit/f72ba3e29fa9cbff699f86114c2bea5b94e386c5))
* open the popover on a tap on mobile even with hover off ([9b59ac4](https://github.com/gotsanity/review-marks/commit/9b59ac4e076d049de23b83a94b84b899b5965486))
* refuse to annotate, rather than write an empty comment, when the editor has no CodeMirror view ([6f01691](https://github.com/gotsanity/review-marks/commit/6f016914d0dc89dcc9732df6698bc1d0d09b4535))
* say a comment cannot be empty when an emptied comment is clicked away from ([86cc31c](https://github.com/gotsanity/review-marks/commit/86cc31c0c13fce3c4e66cf4e497de56dda468313))
* word refusal notices with annotation and selection instead of Target ([367c93a](https://github.com/gotsanity/review-marks/commit/367c93aef7605911b93f753b68c0d5cbe86f08a8))
