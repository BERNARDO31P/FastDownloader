import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {TranslateModule} from '@ngx-translate/core';

import {NavbarComponent, PageNotFoundComponent} from './components/';

import {WebviewDirective} from './directives/';
import {FormsModule} from '@angular/forms';

@NgModule({
  declarations: [PageNotFoundComponent, WebviewDirective, NavbarComponent],
  imports: [CommonModule, TranslateModule, FormsModule],
  exports: [TranslateModule, WebviewDirective, FormsModule, NavbarComponent]
})
export class SharedModule {
}
