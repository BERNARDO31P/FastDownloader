import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {AppService} from '../core/services';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  constructor(private router: Router, private appService: AppService) { }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
  }

}
